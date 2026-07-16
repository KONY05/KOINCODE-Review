import { Octokit } from "@octokit/rest";

const MAX_FILE_SIZE = 100_000;

export async function fetchFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  const octokit = new Octokit({ auth: token });

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (!("content" in data) || data.encoding !== "base64") return null;
    if ((data.size ?? 0) > MAX_FILE_SIZE) return null;

    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

export async function fetchChangedFileContents(
  token: string,
  owner: string,
  repo: string,
  filenames: string[],
  ref: string
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();

  const results = await Promise.allSettled(
    filenames.map(async (filename) => {
      const content = await fetchFileContent(token, owner, repo, filename, ref);
      return { filename, content };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.content) {
      contents.set(result.value.filename, result.value.content);
    }
  }

  return contents;
}
