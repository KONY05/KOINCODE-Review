import type { PRFile } from "../types";
import { shouldSkipFile } from "../diff-utils";
import { gitlabFetch, projectPath } from "./client";

type GitlabDiff = {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
};

type GitlabMergeRequest = {
  diff_refs: {
    base_sha: string;
    start_sha: string;
    head_sha: string;
  };
};

function statusFromFlags(d: GitlabDiff): PRFile["status"] {
  if (d.new_file) return "added";
  if (d.deleted_file) return "removed";
  if (d.renamed_file) return "renamed";
  return "modified";
}

/** GitLab's diff field has no +N/-N summary the way GitHub's file objects do — counted from the patch text itself. */
function countChanges(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }

  return { additions, deletions };
}

/** Synthesizes the `diff --git`/`---`/`+++` header lines GitLab's diff objects omit (old_path/new_path are separate JSON fields instead). */
function toUnifiedDiffBlock(d: GitlabDiff): string {
  return [
    `diff --git a/${d.old_path} b/${d.new_path}`,
    `--- a/${d.old_path}`,
    `+++ b/${d.new_path}`,
    d.diff,
  ].join("\n");
}

async function fetchMergeRequestDiffs(
  token: string,
  owner: string,
  repo: string,
  mrIid: number,
): Promise<GitlabDiff[]> {
  const id = projectPath(owner, repo);
  return gitlabFetch<GitlabDiff[]>(
    token,
    `/projects/${id}/merge_requests/${mrIid}/diffs?per_page=100`,
  );
}

export async function fetchPRFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRFile[]> {
  const diffs = await fetchMergeRequestDiffs(token, owner, repo, prNumber);

  return diffs
    .filter((d) => !shouldSkipFile(d.new_path))
    .map((d) => {
      const { additions, deletions } = countChanges(d.diff);
      return {
        filename: d.new_path,
        status: statusFromFlags(d),
        additions,
        deletions,
        patch: d.diff,
      };
    });
}

export async function fetchPRDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const diffs = await fetchMergeRequestDiffs(token, owner, repo, prNumber);
  return diffs.map(toUnifiedDiffBlock).join("\n");
}

/**
 * Fetches the merge request's current head SHA via diff_refs.head_sha — the
 * same diff_refs object is needed again when posting positioned inline
 * comments (lib/providers/gitlab/comments.ts), so both call sites read it
 * from the same MR endpoint rather than trusting a webhook-time value.
 */
export async function fetchPRHeadSha(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const id = projectPath(owner, repo);
  const mr = await gitlabFetch<GitlabMergeRequest>(
    token,
    `/projects/${id}/merge_requests/${prNumber}`,
  );
  return mr.diff_refs.head_sha;
}
