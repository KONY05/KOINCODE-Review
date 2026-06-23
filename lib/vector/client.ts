import { Pinecone } from "@pinecone-database/pinecone";

import { env } from "@/config/env";
import { MAX_CHUNK_SIZE, CHUNK_OVERLAP } from "./embeddings";

const MAX_FILE_SIZE = 100_000;
const MAX_CHUNKS_PER_FILE = Math.ceil(
  MAX_FILE_SIZE / (MAX_CHUNK_SIZE - CHUNK_OVERLAP)
);

let pineconeClient: Pinecone | null = null;

function getPinecone() {
  if (!pineconeClient) {
    if (!env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY is not set");
    pineconeClient = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  }
  return pineconeClient;
}

export function getIndex() {
  if (!env.PINECONE_INDEX) throw new Error("PINECONE_INDEX is not set");
  return getPinecone().index({name: env.PINECONE_INDEX});
}

export async function deleteNamespace(namespace: string) {
  const index = getIndex();
  await index.namespace(namespace).deleteAll();
}

export async function deleteByFilePath(
  namespace: string,
  repoId: string,
  filePath: string
) {
  const index = getIndex();
  const ids = Array.from({ length: MAX_CHUNKS_PER_FILE }, (_, i) =>
    `${repoId}:${filePath}:${i}`
  );
  await index.namespace(namespace).deleteMany({ ids });
}
