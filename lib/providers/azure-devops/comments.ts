import type { DraftReviewComment, PostedComment, ReviewSummary } from "../types";
import { buildReviewBody, formatCommentBody } from "../review-body";
import { azureFetch, splitOwner } from "./client";

type AzureThread = { id: number };

/**
 * Posts all review comments to an Azure DevOps pull request as threads.
 *
 * Known limitations (both untested against a live Azure DevOps org — see
 * the Feature 19 spec's "Explicitly Not Resolved" section):
 * - Only anchors on `comment.line` as a single-line rightFileStart/End
 *   position — GitHub's `startLine` (multi-line comments) isn't represented,
 *   same gap as GitLab's implementation.
 * - `formatCommentBody`'s ```suggestion fenced block renders as a plain code
 *   block here, not the one-click "Apply suggestion" button GitHub/GitLab
 *   render it as — Azure DevOps threads have no equivalent affordance.
 */
export async function postReviewComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  _headSha: string,
  comments: DraftReviewComment[],
  patches: Map<string, string>,
  reviewSummary: ReviewSummary,
): Promise<PostedComment[]> {
  const { organization, project } = splitOwner(owner);
  const threadsPath = `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prNumber}/threads`;

  const postedComments: PostedComment[] = [];

  for (const comment of comments) {
    if (!patches.has(comment.path)) continue;

    const body = formatCommentBody(comment);
    const filePath = comment.path.startsWith("/") ? comment.path : `/${comment.path}`;

    try {
      const thread = await azureFetch<AzureThread>(token, threadsPath, {
        method: "POST",
        body: JSON.stringify({
          comments: [{ parentCommentId: 0, content: body, commentType: "text" }],
          status: "active",
          threadContext: {
            filePath,
            rightFileStart: { line: comment.line, offset: 1 },
            rightFileEnd: { line: comment.line, offset: 1 },
          },
        }),
      });

      postedComments.push({ path: comment.path, providerCommentId: String(thread.id) });
    } catch (error) {
      console.error("Failed to post Azure DevOps thread:", error);
    }
  }

  const summaryBody = buildReviewBody(reviewSummary, postedComments.length);
  await azureFetch<unknown>(token, threadsPath, {
    method: "POST",
    body: JSON.stringify({
      comments: [{ parentCommentId: 0, content: summaryBody, commentType: "text" }],
      status: "active",
    }),
  });

  return postedComments;
}

export async function replyToComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  inReplyTo: string,
  body: string,
): Promise<void> {
  const { organization, project } = splitOwner(owner);

  await azureFetch<unknown>(
    token,
    `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prNumber}/threads/${inReplyTo}/comments`,
    {
      method: "POST",
      // parentCommentId: 1 assumes the thread's first comment is id 1 (true
      // for threads this pipeline itself created) — a best-effort default,
      // not verified against a live Azure DevOps thread.
      body: JSON.stringify({ content: body, parentCommentId: 1, commentType: "text" }),
    },
  );
}
