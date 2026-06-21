import { getIndex, deleteByFilePath } from "./client";
import { generateEmbeddings, chunkText } from "./embeddings";
import { type RepoFile } from "@/lib/github/tree";

const BATCH_SIZE = 20;

export type IndexingUsage = {
  totalTokens: number;
  totalDurationMs: number;
};

type VectorRecord = {
  id: string;
  values: number[];
  metadata: {
    repoId: string;
    filePath: string;
    fileType: string;
    chunkIndex: number;
    text: string;
  };
};

export async function indexRepoFiles(
  repoId: string,
  files: RepoFile[],
  googleApiKey?: string
): Promise<IndexingUsage> {
  const namespace = `repo:${repoId}`;
  const index = getIndex();
  let totalTokens = 0;
  let totalDurationMs = 0;

  const allChunks: {
    text: string;
    filePath: string;
    fileType: string;
    chunkIndex: number;
  }[] = [];

  for (const file of files) {
    const chunks = chunkText(file.content);
    for (const chunk of chunks) {
      allChunks.push({
        text: chunk.text,
        filePath: file.path,
        fileType: file.fileType,
        chunkIndex: chunk.chunkIndex,
      });
    }
  }

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);
    const result = await generateEmbeddings(texts, googleApiKey);

    totalTokens += result.usage.tokens;
    totalDurationMs += result.durationMs;

    const vectors: VectorRecord[] = batch.map((chunk, j) => ({
      id: `${repoId}:${chunk.filePath}:${chunk.chunkIndex}`,
      values: result.embeddings[j],
      metadata: {
        repoId,
        filePath: chunk.filePath,
        fileType: chunk.fileType,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
      },
    }));

    await index.namespace(namespace).upsert({ records: vectors });
  }

  return { totalTokens, totalDurationMs };
}

export async function indexChangedFiles(
  repoId: string,
  files: RepoFile[],
  googleApiKey?: string
): Promise<IndexingUsage> {
  const namespace = `repo:${repoId}`;

  const filePaths = [...new Set(files.map((f) => f.path))];
  await Promise.all(
    filePaths.map((path) => deleteByFilePath(namespace, path))
  );

  return await indexRepoFiles(repoId, files, googleApiKey);
}
