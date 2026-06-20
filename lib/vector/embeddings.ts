import { embedMany } from "ai";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";

const EMBEDDING_MODEL = "text-embedding-004";
const MAX_CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 200;

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
    start = end - CHUNK_OVERLAP;
    chunkIndex++;
  }

  return chunks;
}

export async function generateEmbeddings(
  texts: string[],
  apiKey?: string
): Promise<number[][]> {
  const provider = apiKey
    ? createGoogleGenerativeAI({ apiKey })
    : google;

  const { embeddings } = await embedMany({
    model: provider.embeddingModel(EMBEDDING_MODEL),
    values: texts,
  });

  return embeddings;
}
