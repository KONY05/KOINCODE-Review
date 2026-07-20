import { azureFetchText, refVersionType, splitOwner } from "./client";

const MAX_FILE_SIZE = 100_000;

export async function fetchFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const { organization, project } = splitOwner(owner);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const versionType = refVersionType(ref);

  const content = await azureFetchText(
    token,
    `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/items` +
      `?path=${encodeURIComponent(normalizedPath)}&versionDescriptor.version=${encodeURIComponent(ref)}` +
      `&versionDescriptor.versionType=${versionType}&includeContent=true`,
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
