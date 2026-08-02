import { getIndex } from "./client";
import { generateEmbeddings } from "./embeddings";

type ContextResult = {
  filePath: string;
  text: string;
  score: number;
};

export type RetrievalResult = {
  contexts: ContextResult[];
  usage: { tokens: number };
  durationMs: number;
};

const MIN_SCORE = 0.7;
const DEFAULT_TOP_K = 10;

export async function retrieveContext(
  repoId: string,
  query: string,
  googleApiKey?: string,
  topK: number = DEFAULT_TOP_K
): Promise<RetrievalResult> {
  const embeddingResult = await generateEmbeddings([query], googleApiKey);
  const [queryEmbedding] = embeddingResult.embeddings;
  const index = getIndex();
  const namespace = `repo:${repoId}`;

  const results = await index.namespace(namespace).query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  const contexts = (results.matches ?? [])
    .filter((match) => (match.score ?? 0) >= MIN_SCORE)
    .map((match) => ({
      filePath: (match.metadata?.filePath as string) ?? "unknown",
      text: (match.metadata?.text as string) ?? "",
      score: match.score ?? 0,
    }));

  return {
    contexts,
    usage: embeddingResult.usage,
    durationMs: embeddingResult.durationMs,
  };
}

export function buildContextQuery(
  prTitle: string,
  filePaths: string[]
): string {
  return `${prTitle}\n\nChanged files:\n${filePaths.join("\n")}`;
}

const MAX_DIFF_EXCERPT = 2000;

/**
 * Query text for semantic related-PR matching. Includes a bounded slice of
 * the diff on top of the title and file list — embedding input is capped
 * anyway, and an unbounded diff would push the signal-carrying title and
 * paths out of the window on a large PR.
 */
export function buildRelatedPRQuery(
  prTitle: string,
  filePaths: string[],
  diff: string
): string {
  return (
    `${prTitle}\n\nChanged files:\n${filePaths.join("\n")}\n\n` +
    `Diff excerpt:\n${diff.slice(0, MAX_DIFF_EXCERPT)}`
  );
}
