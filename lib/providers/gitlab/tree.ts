import type { RepoFile } from "../types";
import { classifyFile } from "../tree-classify";
import { gitlabFetchPaginated, projectPath } from "./client";
import { fetchFileContent } from "./files";

type GitlabTreeItem = {
  path: string;
  type: "tree" | "blob";
};

const MAX_TREE_PAGES = 20;

export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<RepoFile[]> {
  const id = projectPath(owner, repo);
  const MAX_FILES = 30;

  const items: GitlabTreeItem[] = [];
  for (let page = 1; page <= MAX_TREE_PAGES; page++) {
    const { items: batch, hasNextPage } = await gitlabFetchPaginated<GitlabTreeItem[]>(
      token,
      `/projects/${id}/repository/tree?recursive=true&ref=${encodeURIComponent(defaultBranch)}&per_page=100&page=${page}`,
    );
    items.push(...batch);
    if (!hasNextPage) break;
  }

  const treeListing = items
    .map((item) => `${item.type === "tree" ? "d" : "f"} ${item.path}`)
    .join("\n");

  const files: RepoFile[] = [
    { path: "__tree__", content: treeListing, fileType: "tree" },
  ];

  const filesToFetch: { path: string; fileType: RepoFile["fileType"] }[] = [];
  for (const item of items) {
    if (item.type !== "blob") continue;

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
