import type { DraftReviewComment, ReviewSummary } from "./types";

/**
 * Builds the top-level review body with a summary, file-by-file walkthrough,
 * and an optional Mermaid sequence diagram. Pure markdown construction, no
 * provider API calls, so it's shared across every GitProvider implementation
 * rather than duplicated per provider.
 */
export function buildReviewBody(
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
 * Appends a ```suggestion fenced code block to the comment body if a
 * suggestion exists. Both GitHub and GitLab render this identically as a
 * one-click "Apply suggestion" button, so this is shared rather than
 * duplicated per provider.
 */
export function formatCommentBody(comment: DraftReviewComment): string {
  let body = comment.body;

  if (comment.suggestion != null) {
    body += `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``;
  }

  return body;
}
