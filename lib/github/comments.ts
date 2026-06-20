import { Octokit } from "@octokit/rest";

type ReviewComment = {
  path: string;
  line: number;
  body: string;
  suggestion?: string;
};

type PostedComment = {
  path: string;
  githubCommentId: number;
};

type ReviewSummary = {
  summary: string;
  walkthrough: { path: string; change: string }[];
  diagram?: string;
};

/**
 * Builds the top-level review body with a summary, file-by-file walkthrough,
 * and an optional Mermaid sequence diagram. This appears as the main review
 * comment above the inline comments on the PR.
 */
function buildReviewBody(
  reviewSummary: ReviewSummary,
  commentCount: number
): string {
  const sections: string[] = [`## KOINCODE Review`];

  sections.push(reviewSummary.summary);

  if (reviewSummary.walkthrough.length > 0) {
    const walkthroughLines = reviewSummary.walkthrough.map(
      (entry) => `| \`${entry.path}\` | ${entry.change} |`
    );
    sections.push(
      `### Walkthrough\n\n` +
        `| File | Change |\n|------|--------|\n` +
        walkthroughLines.join("\n")
    );
  }

  if (reviewSummary.diagram) {
    sections.push(
      `### Sequence Diagram\n\n\`\`\`mermaid\n${reviewSummary.diagram}\n\`\`\``
    );
  }

  if (commentCount > 0) {
    sections.push(
      `---\n📝 **${commentCount}** inline comment${commentCount === 1 ? "" : "s"} posted below.`
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

  if (comment.suggestion) {
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
 * @returns The posted comments with their GitHub IDs, in the same order as
 *   the input (minus any that were dropped due to unmappable positions).
 */
export async function postReviewComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  comments: ReviewComment[],
  patches: Map<string, string>,
  reviewSummary: ReviewSummary
): Promise<PostedComment[]> {
  const octokit = new Octokit({ auth: token });

  const reviewComments: {
    path: string;
    position: number;
    body: string;
  }[] = [];

  for (const comment of comments) {
    const patch = patches.get(comment.path);
    if (!patch) continue;

    const position = mapDiffLineToPosition(patch, comment.line);
    if (!position) continue;

    reviewComments.push({
      path: comment.path,
      position,
      body: formatCommentBody(comment),
    });
  }

  const body = buildReviewBody(reviewSummary, reviewComments.length);

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

    for (const rc of reviewCommentsData) {
      postedComments.push({
        path: rc.path,
        githubCommentId: rc.id,
      });
    }
  }

  return postedComments;
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
