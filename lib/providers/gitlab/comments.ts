import type { DraftReviewComment, PostedComment, ReviewSummary } from "../types";
import { buildReviewBody } from "../review-body";
import { gitlabFetch, projectPath } from "./client";

/**
 * GitLab supports multi-line suggestions via a `:-N+M` offset annotation on
 * the ```suggestion fence — N lines above the anchored line and M lines
 * below it get replaced too — unlike GitHub, which instead anchors the
 * comment itself across a start_line..line range and lets a plain
 * ```suggestion fence replace that whole range. Our GitLab comment is
 * always anchored at a single line (comment.line, new_line below), so
 * multi-line suggestions need this offset instead of a differently
 * positioned comment. Not part of the shared review-body.ts formatter since
 * GitHub's/Azure DevOps's plain ```suggestion fence has no such syntax.
 */
function formatGitlabCommentBody(comment: DraftReviewComment): string {
  if (comment.suggestion == null) return comment.body;

  const linesAbove = comment.startLine != null ? Math.max(comment.line - comment.startLine, 0) : 0;
  const offset = linesAbove > 0 ? `:-${linesAbove}+0` : "";

  return `${comment.body}\n\n\`\`\`suggestion${offset}\n${comment.suggestion}\n\`\`\``;
}

type GitlabMergeRequest = {
  diff_refs: {
    base_sha: string;
    start_sha: string;
    head_sha: string;
  };
};

type GitlabDiscussion = {
  id: string;
  notes: { id: number; type: string | null }[];
};

/**
 * Posts all review comments to a GitLab merge request.
 *
 * Unlike GitHub (which computes a "diff position" from the patch text),
 * GitLab's Discussions API takes the actual old/new line number directly,
 * plus the MR's `diff_refs` (base/start/head SHAs) to anchor the position —
 * fetched fresh here rather than trusting the pipeline's already-resolved
 * `headSha`, since GitLab requires all three SHAs to come from the same
 * consistent diff_refs read or the position is silently dropped.
 *
 * Known limitation: the *position* always anchors on `comment.line` as the
 * new-file line (position[new_line]) and never sets old_path independently
 * or a multi-line `line_range` — but the *suggestion* itself still covers
 * `comment.startLine..line` via formatGitlabCommentBody's `:-N+0` offset
 * syntax above, so multi-line fixes apply correctly even though the visible
 * comment thread is pinned to a single line. Renamed-file paths aren't
 * represented in this first pass. GitLab responds 201 even when it silently
 * downgrades a position to a plain (unpositioned) note, so
 * `notes[0].type !== "DiffNote"` is checked to log when that happens rather
 * than assuming success.
 */
export async function postReviewComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  comments: DraftReviewComment[],
  patches: Map<string, string>,
  reviewSummary: ReviewSummary,
): Promise<PostedComment[]> {
  const id = projectPath(owner, repo);

  const mr = await gitlabFetch<GitlabMergeRequest>(
    token,
    `/projects/${id}/merge_requests/${prNumber}`,
  );
  const { base_sha, start_sha, head_sha } = mr.diff_refs;

  if (head_sha !== headSha) {
    console.warn(
      `GitLab MR ${prNumber} head_sha (${head_sha}) differs from the pipeline's pinned reviewSha (${headSha}) — using diff_refs as the source of truth for comment positioning.`,
    );
  }

  const postedComments: PostedComment[] = [];

  for (const comment of comments) {
    if (!patches.has(comment.path)) continue;

    const body = formatGitlabCommentBody(comment);

    try {
      const discussion = await gitlabFetch<GitlabDiscussion>(
        token,
        `/projects/${id}/merge_requests/${prNumber}/discussions`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            position: {
              position_type: "text",
              base_sha,
              start_sha,
              head_sha,
              old_path: comment.path,
              new_path: comment.path,
              new_line: comment.line,
            },
          }),
        },
      );

      if (discussion.notes[0]?.type !== "DiffNote") {
        console.warn(
          `GitLab discussion ${discussion.id} on ${comment.path}:${comment.line} was created but not positioned (got an unpositioned note instead) — likely an invalid line/path combination.`,
        );
      }

      postedComments.push({ path: comment.path, providerCommentId: discussion.id });
    } catch (error) {
      console.error("Failed to post GitLab discussion:", error);
    }
  }

  const summaryBody = buildReviewBody(reviewSummary, postedComments.length);
  await gitlabFetch<unknown>(token, `/projects/${id}/merge_requests/${prNumber}/notes`, {
    method: "POST",
    body: JSON.stringify({ body: summaryBody }),
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
  const id = projectPath(owner, repo);

  await gitlabFetch<unknown>(
    token,
    `/projects/${id}/merge_requests/${prNumber}/discussions/${inReplyTo}/notes`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}
