import type { FileChanges } from "./types";

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
