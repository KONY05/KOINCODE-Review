import { Octokit } from "@octokit/rest";

type ChangedRange = {
  start: number;
  end: number;
};

type FileChanges = {
  filename: string;
  ranges: ChangedRange[];
};

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

const PROXIMITY_THRESHOLD = 5;

/** Checks if review comments were addressed by comparing their file+line against changed ranges (±5 line proximity). */
export function detectAdoptions(
  comments: Array<{ path: string; line: number; index: number }>,
  changes: FileChanges[]
): { adopted: number[]; pending: number[] } {
  const changesByFile = new Map(changes.map((c) => [c.filename, c.ranges]));

  const adopted: number[] = [];
  const pending: number[] = [];

  for (const comment of comments) {
    const ranges = changesByFile.get(comment.path);
    if (!ranges) {
      pending.push(comment.index);
      continue;
    }

    const wasModified = ranges.some(
      (range) =>
        comment.line >= range.start - PROXIMITY_THRESHOLD &&
        comment.line <= range.end + PROXIMITY_THRESHOLD
    );

    if (wasModified) {
      adopted.push(comment.index);
    } else {
      pending.push(comment.index);
    }
  }

  return { adopted, pending };
}
