import type { RepoFile } from "../types";
import { classifyFile } from "../tree-classify";
import { azureFetch, splitOwner } from "./client";
import { fetchFileContent } from "./files";

type AzureItem = { path: string; isFolder?: boolean };

const MAX_FILES = 30;

export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<RepoFile[]> {
  const { organization, project } = splitOwner(owner);

  // Azure DevOps's items endpoint returns the whole recursive tree in one
  // response (no pagination token) — same "could be large for a huge repo"
  // risk GitHub's/GitLab's fetchRepoTree already carry, not a new gap here.
  const { value: items } = await azureFetch<{ value: AzureItem[] }>(
    token,
    `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/items` +
      `?recursionLevel=Full&versionDescriptor.version=${encodeURIComponent(defaultBranch)}&versionDescriptor.versionType=branch`,
  );

  // Azure DevOps item paths are rooted ("/README.md", "/src/index.ts") —
  // stripped to match GitHub/GitLab's unrooted convention that
  // classifyFile's CONFIG_FILES lookup and callers elsewhere assume.
  const normalized = items.map((item) => ({
    ...item,
    path: item.path.replace(/^\//, ""),
  }));

  const treeListing = normalized
    .filter((item) => item.path.length > 0)
    .map((item) => `${item.isFolder ? "d" : "f"} ${item.path}`)
    .join("\n");

  const files: RepoFile[] = [{ path: "__tree__", content: treeListing, fileType: "tree" }];

  const filesToFetch: { path: string; fileType: RepoFile["fileType"] }[] = [];
  for (const item of normalized) {
    if (item.isFolder) continue;

    const fileType = classifyFile(item.path);
    if (fileType) {
      filesToFetch.push({ path: item.path, fileType });
    }
    if (filesToFetch.length >= MAX_FILES - 1) break;
  }

  const contentResults = await Promise.allSettled(
    filesToFetch.map(async ({ path, fileType }) => {
      const content = await fetchFileContent(token, owner, repo, path, defaultBranch);
      return content ? ({ path, content, fileType } satisfies RepoFile) : null;
    }),
  );

  for (const result of contentResults) {
    if (result.status === "fulfilled" && result.value) {
      files.push(result.value);
    }
  }

  return files;
}
