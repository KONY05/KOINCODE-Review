import { getIndex, deleteByFilePath } from "./client";
import { generateEmbeddings, chunkText } from "./embeddings";
import { type RepoFile } from "@/lib/github/tree";

const BATCH_SIZE = 20;

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
) {
  const namespace = `repo:${repoId}`;
  const index = getIndex();

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
    const embeddings = await generateEmbeddings(texts, googleApiKey);

    const vectors: VectorRecord[] = batch.map((chunk, j) => ({
      id: `${repoId}:${chunk.filePath}:${chunk.chunkIndex}`,
      values: embeddings[j],
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
}

export async function indexChangedFiles(
  repoId: string,
  files: RepoFile[],
  googleApiKey?: string
) {
  const namespace = `repo:${repoId}`;

  const filePaths = [...new Set(files.map((f) => f.path))];
  await Promise.all(
    filePaths.map((path) => deleteByFilePath(namespace, path))
  );

  await indexRepoFiles(repoId, files, googleApiKey);
}
