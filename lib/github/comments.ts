import { Octokit } from "@octokit/rest";

import type { RelatedPR } from "./related-prs";

type ReviewComment = {
  path: string;
  startLine?: number;
  line: number;
  body: string;
  suggestion?: string;
  /**
   * Whether the finding sits on a line this PR changed, or in pre-existing
   * code around it. Only consulted when the line can't be mapped into the
   * diff: "surrounding" findings are still reported (in the review body),
   * "diff" ones are treated as a bad line number and dropped.
   */
  scope?: "diff" | "surrounding";
  /**
   * The lines `suggestion` would replace, read from the file at the review
   * SHA. Only used to render a real -/+ diff for out-of-diff findings, where
   * there is no patch to recover them from. Absent when the file wasn't
   * fetched or the range fell outside it.
   */
  originalCode?: string;
};

/**
 * A finding that couldn't be posted inline because its line isn't part of the
 * diff, but is worth reporting anyway — rendered into the review body instead
 * of being discarded.
 */
type OutOfDiffFinding = {
  path: string;
  line: number;
  body: string;
  suggestion?: string;
  originalCode?: string;
};

/**
 * Not a display budget — the section is collapsed, so length costs the reader
 * nothing until they open it, and these findings are already generated and
 * paid for by the time we get here. This is only a guard against pathological
 * model output overrunning GitHub's 65,536-character comment body limit.
 * Anything dropped by it is reported rather than silently swallowed.
 */
const MAX_OUT_OF_DIFF = 20;

/**
 * A suggestion that replaces a large range with far fewer lines is proposing
 * a mass deletion, which is never safe to offer as one click from an AI
 * review. Seen live: a finding whose prose described a function at lines
 * 205-224 carried a range of 211..394 with an 8-line suggestion — applying it
 * would have removed 176 lines the comment never mentioned.
 *
 * Deliberately a ratio rather than a flat cap, so a genuine large refactor
 * (replace 60 lines with 65) still gets its suggestion while "replace 184
 * lines with 8" does not.
 */
export function isMassDeletion(
  startLine: number,
  endLine: number,
  suggestion: string
): boolean {
  const rangeLines = endLine - startLine + 1;
  if (rangeLines <= 20) return false;

  return suggestion.split("\n").length < rangeLines / 2;
}

type PostedComment = {
  path: string;
  githubCommentId: number;
  /**
   * Index of the comment in the array handed to {@link postReviewComments}.
   * Comments whose line can't be mapped into the diff are dropped, so posted
   * comments are not positionally aligned with the input — callers attaching
   * GitHub ids back onto their own records must key on this, not on array
   * position.
   */
  sourceIndex: number;
};

export type PostReviewResult = {
  posted: PostedComment[];
  /**
   * How many inline comments were actually submitted to GitHub — i.e. the
   * count after unmappable ones were dropped. This is the same number
   * rendered in the review body, so callers reporting a comment count (commit
   * status, analytics) stay consistent with what the PR actually shows.
   */
  submittedCount: number;
  /**
   * How many pre-existing findings were reported in the body's "Outside This
   * Diff" section. Kept distinct from `submittedCount` rather than folded into
   * it — these are problems the PR did not introduce, and a caller summing the
   * two would report them as if it had.
   */
  outOfDiffCount: number;
};

/**
 * Everything that goes into the top-level review body except the inline
 * comments — the narrative half of a review. Named for the whole rather than
 * its `summary` member, which is only one of four sections and was the source
 * of the `reviewSummary.summary` stutter this replaced.
 */
type ReviewOverview = {
  summary: string;
  walkthrough: { path: string; change: string }[];
  diagram?: string;
  relatedPRs?: RelatedPR[];
};

/**
 * Builds the top-level review body with a summary, file-by-file walkthrough,
 * and an optional Mermaid sequence diagram. This appears as the main review
 * comment above the inline comments on the PR.
 */
function buildReviewBody(
  overview: ReviewOverview,
  commentCount: number,
  outOfDiff: OutOfDiffFinding[] = [],
  outOfDiffTotal: number = outOfDiff.length
): string {
  const sections: string[] = [`## KOINCODE Review`];

  sections.push(overview.summary);

  if (overview.walkthrough.length > 0) {
    const walkthroughLines = overview.walkthrough.map(
      (entry) => `| \`${entry.path}\` | ${entry.change} |`
    );
    sections.push(
      `### Walkthrough\n\n` +
        `| File | Change |\n|------|--------|\n` +
        walkthroughLines.join("\n")
    );
  }

  if (overview.diagram) {
    sections.push(
      `### Sequence Diagram\n\n\`\`\`mermaid\n${overview.diagram}\n\`\`\``
    );
  }

  if (overview.relatedPRs && overview.relatedPRs.length > 0) {
    const lines = overview.relatedPRs.map(
      (pr) => `- [#${pr.number}](${pr.url}): ${pr.reason}`
    );
    sections.push(`### Possibly Related PRs\n\n${lines.join("\n")}`);
  }

  if (outOfDiff.length > 0) {
    const findings = outOfDiff.map((finding) => {
      const heading = `**\`${finding.path}:${finding.line}\`** — ${finding.body}`;

      if (finding.suggestion == null) return heading;

      // Never ```suggestion here — outside an inline comment GitHub renders
      // that as an inert box with a dead "Apply" affordance. A real -/+ diff
      // when the replaced lines were recoverable from the file, since the
      // model tends to echo unchanged context into its suggestion and a bare
      // fence leaves the reader diffing it by eye. Falls back to a plain
      // fence when they weren't, rather than marking the replacement as all
      // `+` additions, which would misread as an insertion.
      const original = finding.originalCode;
      // Same bad-range signal as isMassDeletion, applied for readability
      // rather than safety: nothing is applyable here, but a 184-line `-`
      // block from a mistargeted range buries the fix instead of showing it.
      const usableDiff =
        original != null &&
        original.trim() !== finding.suggestion.trim() &&
        !isMassDeletion(1, original.split("\n").length, finding.suggestion);

      if (!usableDiff) {
        return `${heading}\n\nSuggested fix:\n\n\`\`\`\n${finding.suggestion}\n\`\`\``;
      }

      const removed = original.split("\n").map((line) => `-${line}`);
      const added = finding.suggestion.split("\n").map((line) => `+${line}`);

      return `${heading}\n\n\`\`\`diff\n${[...removed, ...added].join("\n")}\n\`\`\``;
    });

    const hidden = outOfDiffTotal - outOfDiff.length;
    if (hidden > 0) {
      findings.push(
        `_…and ${hidden} more pre-existing issue${hidden === 1 ? "" : "s"} not shown._`
      );
    }

    // Collapsed by default: these are problems the PR didn't introduce, so
    // they shouldn't outweigh the review of what actually changed. The count
    // sits in the summary line so the volume is legible without expanding.
    // The blank line after </summary> is required for GitHub to render the
    // markdown inside as markdown rather than literal text.
    sections.push(
      `<details>\n` +
        `<summary><b>Outside This Diff</b> — ${outOfDiffTotal} pre-existing issue${outOfDiffTotal === 1 ? "" : "s"}</summary>\n\n` +
        `Problems in the files this PR touches that it did not introduce. No inline ` +
        `comments — these lines aren't part of the change, so GitHub can't anchor to them.\n\n` +
        findings.join("\n\n") +
        `\n\n</details>`
    );
  }

  if (commentCount > 0) {
    sections.push(
      `---\n📝 **${commentCount}** inline comment${commentCount === 1 ? "" : "s"} posted below.`
    );
  } else if (outOfDiffTotal > 0) {
    // "No issues found" would contradict the section immediately above it.
    sections.push(
      `---\n✅ No issues on the changed lines. **${outOfDiffTotal}** pre-existing issue${outOfDiffTotal === 1 ? "" : "s"} noted above.`
    );
  } else {
    sections.push(`---\n✅ No issues found.`);
  }

  return sections.join("\n\n");
}

/**
 * Appends a GitHub suggestion code block to the comment body if a suggestion exists.
 * GitHub renders these as one-click "Apply suggestion" buttons in the PR UI.
 */
function formatCommentBody(comment: ReviewComment): string {
  let body = comment.body;

  if (comment.suggestion != null) {
    body += `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``;
  }

  return body;
}

/**
 * Converts an absolute new-file line number to a 1-based diff position that
 * GitHub's review comment API expects.
 *
 * Walks the unified diff patch line by line:
 * - `@@ ... +N,M @@` hunk headers reset `currentLine` to N-1 (next line becomes N).
 * - `-` (deletion) lines are skipped — they don't exist in the new file.
 * - `+` (addition) and context (unchanged) lines increment `currentLine`.
 * - `position` increments on every line including the hunk header.
 *
 * Returns `null` if `targetLine` doesn't appear in the patch (e.g. the line
 * is outside the diff hunks), causing the comment to be silently dropped.
 *
 * @example
 * / Given this patch:
 * / @@ -10,6 +10,8 @@       ← position 1, currentLine = 9
 * /    const a = 1;          ← position 2, currentLine = 10
 * /    const b = 2;          ← position 3, currentLine = 11
 * / +  const c = 3;          ← position 4, currentLine = 12
 * /
 * mapDiffLineToPosition(patch, 12) // → 4
 * mapDiffLineToPosition(patch, 50) // → null (not in patch)
 */
export function mapDiffLineToPosition(
  patch: string,
  targetLine: number
): number | null {
  const lines = patch.split("\n");
  let currentLine = 0;
  let position = 0;

  for (const line of lines) {
    position++;

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    if (line.startsWith("-")) {
      continue;
    }

    if (line.startsWith("+") || !line.startsWith("\\")) {
      currentLine++;
    }

    if (currentLine === targetLine) {
      return position;
    }
  }

  return null;
}

/**
 * Extracts the current-file (post-change) line contents for a range from a
 * unified diff patch, using the same walking logic as mapDiffLineToPosition.
 * Returns null if any line in the range doesn't appear in the patch.
 */
function extractPatchLines(
  patch: string,
  startLine: number,
  endLine: number
): string[] | null {
  const lines = patch.split("\n");
  let currentLine = 0;
  const collected: string[] = [];

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    if (line.startsWith("-")) {
      continue;
    }

    if (line.startsWith("+") || !line.startsWith("\\")) {
      currentLine++;
      if (currentLine >= startLine && currentLine <= endLine) {
        collected.push(line.slice(1));
      }
    }
  }

  const expectedCount = endLine - startLine + 1;
  return collected.length === expectedCount ? collected : null;
}

/**
 * Checks whether a suggestion is a no-op — i.e. identical (modulo trailing
 * whitespace) to the code it claims to replace. Used to drop broken
 * "Apply suggestion" buttons that echo back the existing code instead of
 * fixing it.
 */
function isNoOpSuggestion(
  patch: string,
  startLine: number,
  endLine: number,
  suggestion: string
): boolean {
  const originalLines = extractPatchLines(patch, startLine, endLine);
  if (!originalLines) return false;

  const normalize = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();

  return normalize(originalLines.join("\n")) === normalize(suggestion);
}

/**
 * Posts all review comments to a GitHub PR as a single atomic review.
 *
 * For each comment, looks up the file's patch from `patches`, converts the
 * absolute line number to a diff position via {@link mapDiffLineToPosition},
 * and formats the body with GitHub suggestion syntax if applicable.
 * Comments whose line can't be mapped to the patch are silently dropped.
 *
 * Uses `createReview` with event `COMMENT` so the PR author receives one
 * notification instead of N. After posting, fetches the review's comments
 * back to capture each `githubCommentId` for the apply-fix / resolve flows.
 *
 * @returns The posted comments with their GitHub IDs — each tagged with the
 *   index of the input comment it came from, since dropped comments mean the
 *   result is not positionally aligned with the input — plus the count of
 *   comments actually submitted, which is what the review body reports.
 */
export async function postReviewComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  comments: ReviewComment[],
  patches: Map<string, string>,
  overview: ReviewOverview
): Promise<PostReviewResult> {
  const octokit = new Octokit({ auth: token });

  const reviewComments: {
    path: string;
    line: number;
    start_line?: number;
    side: "RIGHT";
    start_side?: "RIGHT";
    body: string;
  }[] = [];

  const submittedSources: { key: string; sourceIndex: number }[] = [];
  const outOfDiff: OutOfDiffFinding[] = [];
  // Counted separately from the array so a trim by MAX_OUT_OF_DIFF is still
  // reported honestly rather than quietly shrinking the number.
  let outOfDiffTotal = 0;

  // A comment that can't be anchored is only worth reporting if the model
  // meant it to be about pre-existing code. An unmappable "diff"-scoped
  // comment means the model got the line number wrong, and surfacing that
  // would be noise — the thing that teaches people to stop reading reviews.
  const collectIfSurrounding = (comment: ReviewComment) => {
    if (comment.scope !== "surrounding") return;

    outOfDiffTotal++;
    if (outOfDiff.length >= MAX_OUT_OF_DIFF) return;

    outOfDiff.push({
      path: comment.path,
      line: comment.line,
      body: comment.body,
      suggestion: comment.suggestion,
      originalCode: comment.originalCode,
    });
  };

  for (const [sourceIndex, comment] of comments.entries()) {
    const patch = patches.get(comment.path);
    if (!patch) {
      collectIfSurrounding(comment);
      continue;
    }

    const position = mapDiffLineToPosition(patch, comment.line);
    if (!position) {
      collectIfSurrounding(comment);
      continue;
    }

    let suggestion = comment.suggestion;

    // An empty suggestion is a one-click deletion of every line in the range.
    // Observed live on KONY05/todo-app-testing#18: a comment asking the author
    // to ADD an accessibility label shipped an empty block over a 7-line
    // range, so applying it would have deleted working JSX. The model reaches
    // this state by failing to write the fix, not by intending a deletion, and
    // the downside is asymmetric — losing a rarely-wanted delete button costs
    // far less than silently destroying code. Deletions are still advised in
    // the comment prose, just not made one-click.
    if (suggestion != null && suggestion.trim() === "") {
      suggestion = undefined;
    }

    if (
      suggestion != null &&
      isMassDeletion(
        comment.startLine ?? comment.line,
        comment.line,
        suggestion
      )
    ) {
      suggestion = undefined;
    }

    if (
      suggestion != null &&
      isNoOpSuggestion(
        patch,
        comment.startLine ?? comment.line,
        comment.line,
        suggestion
      )
    ) {
      suggestion = undefined;
    }

    const entry: (typeof reviewComments)[number] = {
      path: comment.path,
      line: comment.line,
      side: "RIGHT" as const,
      body: formatCommentBody({ ...comment, suggestion }),
    };

    if (comment.startLine && comment.startLine < comment.line) {
      const startPosition = mapDiffLineToPosition(patch, comment.startLine);
      if (startPosition) {
        entry.start_line = comment.startLine;
        entry.start_side = "RIGHT" as const;
      }
    }

    reviewComments.push(entry);
    submittedSources.push({
      key: `${comment.path}:${comment.line}`,
      sourceIndex,
    });
  }

  const body = buildReviewBody(
    overview,
    reviewComments.length,
    outOfDiff,
    outOfDiffTotal
  );

  const { data } = await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    body,
    event: "COMMENT",
    ...(reviewComments.length > 0 ? { comments: reviewComments } : {}),
  });

  const postedComments: PostedComment[] = [];
  if (data.id) {
    const { data: reviewCommentsData } =
      await octokit.pulls.listCommentsForReview({
        owner,
        repo,
        pull_number: prNumber,
        review_id: data.id,
        per_page: 100,
      });

    // Matched on path+line rather than array position: GitHub returns review
    // comments in its own order, which is not guaranteed to be submission
    // order. Duplicate keys are consumed FIFO so two comments on the same
    // line still resolve to distinct source indices.
    const sourcesByKey = new Map<string, number[]>();
    for (const { key, sourceIndex } of submittedSources) {
      const queue = sourcesByKey.get(key);
      if (queue) {
        queue.push(sourceIndex);
      } else {
        sourcesByKey.set(key, [sourceIndex]);
      }
    }

    for (const rc of reviewCommentsData) {
      const sourceIndex = sourcesByKey.get(`${rc.path}:${rc.line}`)?.shift();
      if (sourceIndex === undefined) continue;

      postedComments.push({
        path: rc.path,
        githubCommentId: rc.id,
        sourceIndex,
      });
    }
  }

  return {
    posted: postedComments,
    submittedCount: reviewComments.length,
    outOfDiffCount: outOfDiffTotal,
  };
}

const DESCRIPTION_SUMMARY_START = "<!-- koincode:summary:start -->";
const DESCRIPTION_SUMMARY_END = "<!-- koincode:summary:end -->";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDescriptionSummary(description: string): string {
  return [
    DESCRIPTION_SUMMARY_START,
    `## Summary by KOINCODE`,
    description,
    DESCRIPTION_SUMMARY_END,
  ].join("\n\n");
}

/**
 * Injects a "Summary by KOINCODE" section into the PR's own description,
 * mirroring how CodeRabbit edits the PR body itself rather than only leaving
 * a separate review comment. Takes the LLM's purpose-built `description`
 * output (contributor-facing, no review verdict) rather than the review's
 * `summary` — the two are generated separately so neither has to compromise
 * on audience/tone, and so this text doesn't just duplicate the review
 * comment's own summary line.
 *
 * The marker comments make this idempotent: a re-review (e.g. on new
 * commits) replaces the existing section in place instead of appending a
 * duplicate, and any human-written description text outside the markers is
 * left untouched.
 */
export async function updatePullRequestDescription(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  description: string
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  const existingBody = pr.body ?? "";

  const summarySection = buildDescriptionSummary(description);

  const markerRegex = new RegExp(
    `${escapeRegExp(DESCRIPTION_SUMMARY_START)}[\\s\\S]*?${escapeRegExp(DESCRIPTION_SUMMARY_END)}`
  );

  const newBody = markerRegex.test(existingBody)
    ? existingBody.replace(markerRegex, summarySection)
    : existingBody
      ? `${existingBody}\n\n${summarySection}`
      : summarySection;

  if (newBody === existingBody) return;

  await octokit.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    body: newBody,
  });
}

export async function replyToComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  inReplyTo: number,
  body: string
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  await octokit.pulls.createReplyForReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    comment_id: inReplyTo,
    body,
  });
}
