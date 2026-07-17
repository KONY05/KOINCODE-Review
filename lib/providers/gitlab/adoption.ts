import type { FileChanges } from "../types";
import { parseHunkRanges } from "../diff-utils";
import { gitlabFetch, projectPath } from "./client";

type GitlabCompareResponse = {
  diffs: { new_path: string; diff: string }[];
};

/** Compares two commits via GitLab's compare API and returns each changed file with its modified line ranges. */
export async function fetchPushChanges(
  token: string,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
): Promise<FileChanges[]> {
  const id = projectPath(owner, repo);

  const data = await gitlabFetch<GitlabCompareResponse>(
    token,
    `/projects/${id}/repository/compare?from=${encodeURIComponent(baseSha)}&to=${encodeURIComponent(headSha)}`,
  );

  return (data.diffs ?? [])
    .filter((d) => d.diff)
    .map((d) => ({
      filename: d.new_path,
      ranges: parseHunkRanges(d.diff),
    }));
}
