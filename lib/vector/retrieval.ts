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
