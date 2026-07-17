import { gitlabFetchText, projectPath } from "./client";

const MAX_FILE_SIZE = 100_000;

export async function fetchFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const id = projectPath(owner, repo);
  const filePath = encodeURIComponent(path);

  const content = await gitlabFetchText(
    token,
    `/projects/${id}/repository/files/${filePath}/raw?ref=${encodeURIComponent(ref)}`,
  );

  if (content === null) return null;
  if (content.length > MAX_FILE_SIZE) return null;

  return content;
}

export async function fetchChangedFileContents(
  token: string,
  owner: string,
  repo: string,
  filenames: string[],
  ref: string,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();

  const results = await Promise.allSettled(
    filenames.map(async (filename) => {
      const content = await fetchFileContent(token, owner, repo, filename, ref);
      return { filename, content };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.content) {
      contents.set(result.value.filename, result.value.content);
    }
  }

  return contents;
}
