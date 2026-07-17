import { Octokit } from "@octokit/rest";

import type { FileChanges } from "../types";
import { parseHunkRanges } from "../diff-utils";

/** Compares two commits via GitHub's compare API and returns each changed file with its modified line ranges. */
export async function fetchPushChanges(
  token: string,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string
): Promise<FileChanges[]> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.repos.compareCommits({
    owner,
    repo,
    base: baseSha,
    head: headSha,
  });

  return (data.files ?? [])
    .filter((f) => f.patch)
    .map((f) => ({
      filename: f.filename,
      ranges: parseHunkRanges(f.patch!),
    }));
}
