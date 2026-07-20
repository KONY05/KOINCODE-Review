import { structuredPatch } from "diff";

export type SyntheticDiff = { patch: string; additions: number; deletions: number };

/**
 * Azure DevOps has no endpoint that returns literal unified-diff patch text
 * per file the way GitHub's raw diff media type or GitLab's per-file `diff`
 * field do — the documented diffs/commits endpoint returns a structured
 * change-type list (added/edited/deleted/renamed paths), not hunk-level
 * line diffs. Computed locally instead: fetch both file versions and diff
 * them with jsdiff, producing genuine `@@ -x,y +a,b @@` hunk headers so the
 * rest of the pipeline (parseHunkRanges, the LLM prompt) doesn't need to
 * know the diff didn't come from the provider's API.
 */
export function computeUnifiedDiff(path: string, oldContent: string, newContent: string): SyntheticDiff {
  const result = structuredPatch(path, path, oldContent, newContent, "", "", { context: 3 });

  let additions = 0;
  let deletions = 0;
  const hunkBlocks = result.hunks.map((hunk) => {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
    }
    return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n${hunk.lines.join("\n")}`;
  });

  const patch = [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...hunkBlocks].join("\n");

  return { patch, additions, deletions };
}
