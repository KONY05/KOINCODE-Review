import { Octokit } from "@octokit/rest";

import type { ChangedRange, FileChanges } from "../types";

/** Extracts line ranges from unified diff hunk headers (e.g. `@@ -10,5 +10,7 @@` → `{start: 10, end: 14}`). */
function parseHunkRanges(patch: string): ChangedRange[] {
  const ranges: ChangedRange[] = [];
  const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm;

  let match;
  while ((match = hunkPattern.exec(patch))) {
    const start = parseInt(match[1], 10);
    const count = match[2] ? parseInt(match[2], 10) : 1;
    ranges.push({ start, end: start + count - 1 });
  }

  return ranges;
}

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
