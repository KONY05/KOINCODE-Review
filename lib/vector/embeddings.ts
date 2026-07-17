import { embedMany } from "ai";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const MAX_CHUNK_SIZE = 4000;
export const CHUNK_OVERLAP = 200;

export type TextChunk = {
  text: string;
  chunkIndex: number;
};

export function chunkText(text: string): TextChunk[] {
  if (text.length <= MAX_CHUNK_SIZE) {
    return [{ text, chunkIndex: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + MAX_CHUNK_SIZE, text.length);
    chunks.push({ text: text.slice(start, end), chunkIndex });
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
    chunkIndex++;
  }

  return chunks;
}

export type EmbeddingResult = {
  embeddings: number[][];
  usage: { tokens: number };
  durationMs: number;
};

// Google's embedContent/batchEmbedContents API never returns token usage,
// so @ai-sdk/google's doEmbed() always resolves usage as undefined. Estimate
// from character count (~4 chars/token) so usage logs aren't always zero.
function estimateTokens(texts: string[]): number {
  const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
  return Math.ceil(totalChars / 4);
}

export async function generateEmbeddings(
  texts: string[],
  apiKey?: string
): Promise<EmbeddingResult> {
  const provider = apiKey
    ? createGoogleGenerativeAI({ apiKey })
    : google;

  const startTime = Date.now();

  const { embeddings, usage } = await embedMany({
    model: provider.embeddingModel(EMBEDDING_MODEL),
    values: texts,
    providerOptions: {
      google: { outputDimensionality: 768 },
    },
  });

  const durationMs = Date.now() - startTime;

  return {
    embeddings,
    usage: { tokens: usage?.tokens || estimateTokens(texts) },
    durationMs,
  };
}
