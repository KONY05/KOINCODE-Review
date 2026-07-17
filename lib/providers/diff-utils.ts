import type { ChangedRange } from "./types";

const SKIP_PATTERNS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.min\.(js|css)$/,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/,
];

/** Files never worth sending to the review LLM — same rules regardless of git host. */
export function shouldSkipFile(filename: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Extracts line ranges from unified diff hunk headers (e.g. `@@ -10,5 +10,7 @@` → `{start: 10, end: 14}`).
 * Unified diff hunk-header syntax is identical across GitHub and GitLab (both
 * are plain `git diff` output), so this is shared rather than duplicated.
 */
export function parseHunkRanges(patch: string): ChangedRange[] {
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
