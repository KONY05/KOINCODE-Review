import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { env } from "@/config/env";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";
import {
  findActiveRepo,
  cancelInFlightReviews,
  findParentReviewComment,
} from "@/lib/webhooks/repo-lookup";

type MergeRequestAction =
  | "open"
  | "close"
  | "reopen"
  | "update"
  | "merge"
  | "approved"
  | "unapproved";

type MergeRequestPayload = {
  object_kind: "merge_request";
  project: { id: number; path_with_namespace: string };
  object_attributes: {
    iid: number;
    title: string;
    url: string;
    state: "opened" | "closed" | "merged" | "locked";
    action?: MergeRequestAction;
    source_branch: string;
    target_branch: string;
    draft?: boolean;
    work_in_progress?: boolean;
    oldrev?: string;
    last_commit: { id: string };
  };
};

type NotePayload = {
  object_kind: "note";
  project: { id: number; path_with_namespace: string };
  merge_request?: { iid: number };
  object_attributes: {
    id: number;
    note: string;
    noteable_type: string;
    url: string;
    discussion_id?: string;
  };
};

const REVIEWABLE_ACTIONS = new Set<MergeRequestAction>(["open", "update", "reopen"]);

/**
 * GitLab's webhook auth is a static secret sent verbatim in X-Gitlab-Token
 * (no HMAC over the body the way GitHub's X-Hub-Signature-256 works) — still
 * compared via timingSafeEqual to avoid leaking the secret through
 * response-time side channels.
 */
function verifyToken(token: string | null): boolean {
  if (!env.GITLAB_WEBHOOK_SECRET || !token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(env.GITLAB_WEBHOOK_SECRET);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

async function handleMergeRequestClosed(payload: MergeRequestPayload) {
  const repo = await findActiveRepo("gitlab", String(payload.project.id));
  if (!repo) return NextResponse.json({ ignored: true });

  const merged = payload.object_attributes.state === "merged";

  if (merged) {
    await inngest.send({
      name: "pr/adoption-summary",
      data: {
        repoId: repo.id,
        userId: repo.userId,
        prNumber: payload.object_attributes.iid,
        repoFullName: payload.project.path_with_namespace,
      },
    });
  }

  const summary = merged
    ? "Review cancelled — merge request was merged."
    : "Review cancelled — merge request was closed.";

  const cancelled = await cancelInFlightReviews(
    repo.id,
    payload.object_attributes.iid,
    summary,
  );

  if (cancelled.length === 0) {
    return NextResponse.json({ ignored: true });
  }

  const events = cancelled.map((r) => ({
    name: "pr/review-cancelled" as const,
    data: {
      reviewId: r.id,
      repoId: repo.id,
      repoFullName: payload.project.path_with_namespace,
      headSha: payload.object_attributes.last_commit.id,
      userId: repo.userId,
    },
  }));

  await inngest.send(events);

  await trackServer(EVENTS.REVIEW_CANCELLED, repo.userId, {
    repo_name: payload.project.path_with_namespace,
    pr_number: payload.object_attributes.iid,
    reason: merged ? "merged" : "closed",
    cancelled_count: cancelled.length,
  });

  return NextResponse.json({ cancelled: cancelled.length });
}

async function handleMergeRequest(payload: MergeRequestPayload) {
  if (
    payload.object_attributes.state === "merged" ||
    payload.object_attributes.state === "closed"
  ) {
    return handleMergeRequestClosed(payload);
  }

  const action = payload.object_attributes.action;
  if (!action || !REVIEWABLE_ACTIONS.has(action)) {
    return NextResponse.json({ ignored: true });
  }

  if (payload.object_attributes.draft ?? payload.object_attributes.work_in_progress) {
    return NextResponse.json({ ignored: true });
  }

  const repo = await findActiveRepo("gitlab", String(payload.project.id));
  if (!repo) return NextResponse.json({ ignored: true });

  if (action === "update") {
    // GitLab's "update" action fires for title/description/label edits too,
    // not just new pushes — oldrev is only present when a push triggered it,
    // the equivalent of GitHub's before/after on a "synchronize" event.
    if (!payload.object_attributes.oldrev) {
      return NextResponse.json({ ignored: true });
    }

    await inngest.send({
      name: "pr/adoption-check",
      data: {
        repoId: repo.id,
        userId: repo.userId,
        prNumber: payload.object_attributes.iid,
        repoFullName: payload.project.path_with_namespace,
        beforeSha: payload.object_attributes.oldrev,
        afterSha: payload.object_attributes.last_commit.id,
      },
    });

    await cancelInFlightReviews(
      repo.id,
      payload.object_attributes.iid,
      "Superseded by newer commit.",
    );
  }

  const [review] = await db
    .insert(reviews)
    .values({
      repoId: repo.id,
      userId: repo.userId,
      prNumber: payload.object_attributes.iid,
      prTitle: payload.object_attributes.title,
      prUrl: payload.object_attributes.url,
      status: "pending",
    })
    .returning({ id: reviews.id });

  await inngest.send({
    name: "pr/review-requested",
    data: {
      reviewId: review.id,
      repoId: repo.id,
      userId: repo.userId,
      prNumber: payload.object_attributes.iid,
      prTitle: payload.object_attributes.title,
      prUrl: payload.object_attributes.url,
      headSha: payload.object_attributes.last_commit.id,
      headBranch: payload.object_attributes.source_branch,
      baseBranch: payload.object_attributes.target_branch,
      repoFullName: payload.project.path_with_namespace,
    },
  });

  await trackServer(EVENTS.REVIEW_REQUESTED, repo.userId, {
    repo_name: payload.project.path_with_namespace,
    pr_number: payload.object_attributes.iid,
  });

  return NextResponse.json({ reviewId: review.id });
}

async function handleNote(payload: NotePayload) {
  if (payload.object_attributes.noteable_type !== "MergeRequest") {
    return NextResponse.json({ ignored: true });
  }

  const discussionId = payload.object_attributes.discussion_id;
  if (!discussionId || !payload.merge_request) {
    return NextResponse.json({ ignored: true });
  }

  const repo = await findActiveRepo("gitlab", String(payload.project.id));
  if (!repo) return NextResponse.json({ ignored: true });

  const parentComment = await findParentReviewComment(repo.id, discussionId);
  if (!parentComment) return NextResponse.json({ ignored: true });

  // GitLab doesn't distinguish "the note that started the discussion" from a
  // genuine reply the way GitHub's in_reply_to_id does — every note in a
  // thread shares the same discussion_id, including the one KOINCODE itself
  // just posted, and note_events fires for API-created notes too. Best-effort
  // guard: skip if the incoming note is byte-identical to the comment body we
  // stored. Not watertight (a human could paste the same text back), but this
  // whole path hasn't been exercised against a live GitLab webhook yet — the
  // real fix (comparing note.author against the connected GitLab identity)
  // needs that identity stored somewhere, which isn't scoped here.
  if (payload.object_attributes.note.trim() === parentComment.body.trim()) {
    return NextResponse.json({ ignored: true });
  }

  await inngest.send({
    name: "comment/reply-received",
    data: {
      repoId: repo.id,
      userId: repo.userId,
      prNumber: payload.merge_request.iid,
      repoFullName: payload.project.path_with_namespace,
      originalComment: parentComment.body,
      userReply: payload.object_attributes.note,
      replyCommentId: discussionId,
      sourceUrl: payload.object_attributes.url,
    },
  });

  return NextResponse.json({ dispatched: true });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-gitlab-token");
  if (!verifyToken(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json();

  if (body.object_kind === "merge_request") {
    return handleMergeRequest(body as MergeRequestPayload);
  }

  if (body.object_kind === "note") {
    return handleNote(body as NotePayload);
  }

  return NextResponse.json({ ignored: true });
}
