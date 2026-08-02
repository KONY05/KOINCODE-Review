import { Octokit } from "@octokit/rest";

export type RelatedPR = {
  number: number;
  title: string;
  url: string;
  reason: string;
};

/**
 * A PR that might be related, before the review model has judged it. Produced
 * by two sources with different strengths: semantic retrieval from the vector
 * store (carries `description`) and GitHub commit history (carries
 * `matchedFiles`). Shared here rather than in `lib/vector/` because
 * `RelatedPR` — the resolved output both paths converge on — already lives
 * alongside it.
 */
export type RelatedPRCandidate = {
  number: number;
  title: string;
  url: string;
  description?: string;
  matchedFiles?: string[];
};

const MAX_FILES_SAMPLED = 5;
const COMMITS_PER_FILE = 3;
const MAX_RELATED_PRS = 3;

/**
 * Finds past merged PRs in the same repo that touched files this PR also
 * touches, by walking each file's commit history on baseBranch and resolving
 * those commits back to the PRs that merged them.
 *
 * This is the cold-start path: it reads history that already exists, so it
 * works on a repo connected yesterday. The semantic path (`lib/vector/
 * pr-index.ts`) supersedes it once the repo has accumulated reviewed PRs.
 * Same-repo only — see context/feature-spec/18-related-prs-inclusion.md.
 */
export async function fetchRelatedPRGithubCandidates(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  baseBranch: string,
  changedFiles: string[]
): Promise<RelatedPRCandidate[]> {
  const octokit = new Octokit({ auth: token });

  const matchedFilesByPR = new Map<
    number,
    { title: string; url: string; mergedAt: string; files: Set<string> }
  >();

  for (const file of changedFiles.slice(0, MAX_FILES_SAMPLED)) {
    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      path: file,
      sha: baseBranch,
      per_page: COMMITS_PER_FILE,
    });

    for (const commit of commits) {
      const { data: associatedPRs } =
        await octokit.repos.listPullRequestsAssociatedWithCommit({
          owner,
          repo,
          commit_sha: commit.sha,
        });

      for (const pr of associatedPRs) {
        if (pr.number === prNumber || !pr.merged_at) continue;

        const existing = matchedFilesByPR.get(pr.number);
        if (existing) {
          existing.files.add(file);
        } else {
          matchedFilesByPR.set(pr.number, {
            title: pr.title,
            url: pr.html_url,
            mergedAt: pr.merged_at,
            files: new Set([file]),
          });
        }
      }
    }
  }

  return Array.from(matchedFilesByPR.entries())
    .sort(([, a], [, b]) => {
      if (b.files.size !== a.files.size) return b.files.size - a.files.size;
      return new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime();
    })
    .slice(0, MAX_RELATED_PRS)
    .map(([number, { title, url, files }]) => ({
      number,
      title,
      url,
      matchedFiles: Array.from(files),
    }));
}

/**
 * Merges the review model's selections back onto the candidates we retrieved.
 *
 * The model returns only `{ number, reason }` — title and URL come from our
 * own candidate list, never from its output. A number it didn't get from the
 * candidates section is dropped rather than rendered, which is what makes a
 * fabricated link impossible rather than merely unlikely: these render as
 * clickable links on someone's pull request.
 */
export function resolveRelatedPRs(
  selected: { number: number; reason: string }[],
  candidates: RelatedPRCandidate[]
): RelatedPR[] {
  const byNumber = new Map(candidates.map((c) => [c.number, c]));
  const seen = new Set<number>();
  const resolved: RelatedPR[] = [];

  for (const { number, reason } of selected) {
    const candidate = byNumber.get(number);
    if (!candidate || seen.has(number) || !reason.trim()) continue;

    seen.add(number);
    resolved.push({
      number: candidate.number,
      title: candidate.title,
      url: candidate.url,
      reason: reason.trim(),
    });

    if (resolved.length === MAX_RELATED_PRS) break;
  }

  return resolved;
}
