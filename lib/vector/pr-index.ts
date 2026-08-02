import { getIndex } from "./client";
import { generateEmbeddings } from "./embeddings";
import type { RelatedPRCandidate } from "@/lib/github/related-prs";

const MIN_SCORE = 0.7;
const DEFAULT_TOP_K = 5;

export type IndexedPR = {
  number: number;
  title: string;
  url: string;
  description: string;
  walkthrough: { path: string; change: string }[];
};

export type PRIndexUsage = {
  tokens: number;
  durationMs: number;
};

function prNamespace(repoId: string): string {
  return `repo:${repoId}:prs`;
}

function prVectorId(repoId: string, prNumber: number): string {
  return `${repoId}:pr:${prNumber}`;
}

/**
 * Builds the text embedded for a PR record: what the PR did, in prose.
 *
 * Deliberately the LLM-authored description and walkthrough rather than the
 * raw diff — a diff is mostly syntax noise, while the walkthrough is already
 * a distilled summary of the same change, so it embeds to a far more useful
 * point in the vector space.
 */
function buildPRText(pr: IndexedPR): string {
  const walkthrough = pr.walkthrough
    .map((entry) => `${entry.path}: ${entry.change}`)
    .join("\n");

  return [pr.title, pr.description, walkthrough].filter(Boolean).join("\n\n");
}

/**
 * Upserts a single vector representing a reviewed PR into the repo's PR
 * namespace, so future PRs can find it by semantic similarity rather than
 * only by file-path overlap.
 *
 * One vector per PR (not chunked) — descriptions land well under
 * MAX_CHUNK_SIZE. The id is keyed on prNumber, so a re-review on a new commit
 * overwrites the previous record instead of accumulating duplicates.
 */
export async function indexReviewedPR(
  repoId: string,
  pr: IndexedPR,
  googleApiKey?: string
): Promise<PRIndexUsage> {
  const text = buildPRText(pr);
  const result = await generateEmbeddings([text], googleApiKey);

  await getIndex()
    .namespace(prNamespace(repoId))
    .upsert({
      records: [
        {
          id: prVectorId(repoId, pr.number),
          values: result.embeddings[0],
          metadata: {
            repoId,
            prNumber: pr.number,
            title: pr.title,
            url: pr.url,
            text,
          },
        },
      ],
    });

  return { tokens: result.usage.tokens, durationMs: result.durationMs };
}

/**
 * Finds previously reviewed PRs in this repo semantically similar to the
 * given query. Excludes the current PR via a metadata filter — a re-review
 * would otherwise match its own indexed record from the previous run, which
 * scores near 1.0 and would crowd out every genuine candidate.
 */
export async function retrieveRelatedPRVectorCandidates(
  repoId: string,
  query: string,
  excludePrNumber: number,
  googleApiKey?: string,
  topK: number = DEFAULT_TOP_K
): Promise<{ candidates: RelatedPRCandidate[]; usage: PRIndexUsage }> {
  const embeddingResult = await generateEmbeddings([query], googleApiKey);

  const results = await getIndex()
    .namespace(prNamespace(repoId))
    .query({
      vector: embeddingResult.embeddings[0],
      topK,
      includeMetadata: true,
      filter: { prNumber: { $ne: excludePrNumber } },
    });

  const candidates: RelatedPRCandidate[] = (results.matches ?? [])
    .filter((match) => (match.score ?? 0) >= MIN_SCORE)
    .map((match) => ({
      number: match.metadata?.prNumber as number,
      title: (match.metadata?.title as string) ?? "",
      url: (match.metadata?.url as string) ?? "",
      description: match.metadata?.text as string | undefined,
    }))
    .filter((candidate) => typeof candidate.number === "number" && candidate.url);

  return {
    candidates,
    usage: {
      tokens: embeddingResult.usage.tokens,
      durationMs: embeddingResult.durationMs,
    },
  };
}

/**
 * Removes a PR's vector — used when a PR closes without merging, so abandoned
 * work stops being offered as related context on future PRs.
 */
export async function deleteIndexedPR(
  repoId: string,
  prNumber: number
): Promise<void> {
  await getIndex()
    .namespace(prNamespace(repoId))
    .deleteMany({ ids: [prVectorId(repoId, prNumber)] });
}

export function getPRNamespace(repoId: string): string {
  return prNamespace(repoId);
}
