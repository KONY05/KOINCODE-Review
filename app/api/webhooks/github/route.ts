import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/lib/db";
import { repos, reviews } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";

type PullRequestAction =
  | "opened"
  | "synchronize"
  | "closed"
  | "reopened"
  | "edited"
  | "ready_for_review"
  | "locked"
  | "unlocked";

type PullRequestPayload = {
  action: PullRequestAction;
  number: number;
  before?: string;
  after?: string;
  pull_request: {
    title: string;
    html_url: string;
    merged?: boolean;
    head: {
      sha: string;
      ref: string;
    };
    base: {
      ref: string;
    };
    draft: boolean;
  };
  repository: {
    id: number;
    full_name: string;
  };
};

type ReviewCommentPayload = {
  action: "created" | "edited" | "deleted";
  comment: {
    id: number;
    body: string;
    html_url: string;
    in_reply_to_id?: number;
    user: {
      login: string;
    };
  };
  pull_request: {
    number: number;
  };
  repository: {
    id: number;
    full_name: string;
  };
};

const REVIEWABLE_ACTIONS = new Set<PullRequestAction>(["opened", "synchronize"]);
const SUPPORTED_EVENTS = new Set(["pull_request", "pull_request_review_comment"]);

function verifySignature(payload: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", env.GITHUB_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex")}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

async function cancelInFlightReviews(
  repoId: string,
  prNumber: number,
  summary: string
) {
  const inFlight = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.repoId, repoId),
        eq(reviews.prNumber, prNumber),
        inArray(reviews.status, ["pending", "in_progress"])
      )
    );

  if (inFlight.length === 0) return [];

  await db
    .update(reviews)
    .set({ status: "failed", summary })
    .where(
      and(
        eq(reviews.repoId, repoId),
        eq(reviews.prNumber, prNumber),
        inArray(reviews.status, ["pending", "in_progress"])
      )
    );

  return inFlight;
}

async function handlePullRequestClosed(payload: PullRequestPayload) {
  const [repo] = await db
    .select({ id: repos.id, userId: repos.userId })
    .from(repos)
    .where(
      and(
        eq(repos.githubId, payload.repository.id),
        eq(repos.isActive, true)
      )
    )
    .limit(1);

  if (!repo) {
    return NextResponse.json({ ignored: true });
  }

  if (payload.pull_request.merged) {
    await inngest.send({
      name: "pr/adoption-summary",
      data: {
        repoId: repo.id,
        userId: repo.userId,
        prNumber: payload.number,
        repoFullName: payload.repository.full_name,
      },
    });
  }

  const summary = payload.pull_request.merged
    ? "Review cancelled — PR was merged."
    : "Review cancelled — PR was closed.";

  const cancelled = await cancelInFlightReviews(
    repo.id,
    payload.number,
    summary
  );

  if (cancelled.length === 0) {
    return NextResponse.json({ ignored: true });
  }

  const events = cancelled.map((r) => ({
    name: "pr/review-cancelled" as const,
    data: {
      reviewId: r.id,
      repoFullName: payload.repository.full_name,
      headSha: payload.pull_request.head.sha,
      userId: repo.userId,
    },
  }));

  await inngest.send(events);

  if (cancelled.length > 0) {
    await trackServer(EVENTS.REVIEW_CANCELLED, repo.userId, {
      repo_name: payload.repository.full_name,
      pr_number: payload.number,
      reason: payload.pull_request.merged ? "merged" : "closed",
      cancelled_count: cancelled.length,
    });
  }

  return NextResponse.json({ cancelled: cancelled.length });
}

async function handlePullRequest(payload: PullRequestPayload) {
  if (payload.action === "closed") {
    return handlePullRequestClosed(payload);
  }

  if (!REVIEWABLE_ACTIONS.has(payload.action)) {
    return NextResponse.json({ ignored: true });
  }

  if (payload.pull_request.draft) {
    return NextResponse.json({ ignored: true });
  }

  const [repo] = await db
    .select({ id: repos.id, userId: repos.userId })
    .from(repos)
    .where(
      and(
        eq(repos.githubId, payload.repository.id),
        eq(repos.isActive, true)
      )
    )
    .limit(1);

  if (!repo) {
    return NextResponse.json({ ignored: true });
  }

  if (payload.action === "synchronize") {
    if (payload.before && payload.after) {
      await inngest.send({
        name: "pr/adoption-check",
        data: {
          repoId: repo.id,
          userId: repo.userId,
          prNumber: payload.number,
          repoFullName: payload.repository.full_name,
          beforeSha: payload.before,
          afterSha: payload.after,
        },
      });
    }

    await cancelInFlightReviews(
      repo.id,
      payload.number,
      "Superseded by newer commit."
    );
  }

  const [review] = await db
    .insert(reviews)
    .values({
      repoId: repo.id,
      userId: repo.userId,
      prNumber: payload.number,
      prTitle: payload.pull_request.title,
      prUrl: payload.pull_request.html_url,
      status: "pending",
    })
    .returning({ id: reviews.id });

  await inngest.send({
    name: "pr/review-requested",
    data: {
      reviewId: review.id,
      repoId: repo.id,
      userId: repo.userId,
      prNumber: payload.number,
      prTitle: payload.pull_request.title,
      prUrl: payload.pull_request.html_url,
      headSha: payload.pull_request.head.sha,
      headBranch: payload.pull_request.head.ref,
      baseBranch: payload.pull_request.base.ref,
      repoFullName: payload.repository.full_name,
    },
  });

  await trackServer(EVENTS.REVIEW_REQUESTED, repo.userId, {
    repo_name: payload.repository.full_name,
    pr_number: payload.number,
  });

  return NextResponse.json({ reviewId: review.id });
}

async function handleReviewComment(payload: ReviewCommentPayload) {
  if (payload.action !== "created") {
    return NextResponse.json({ ignored: true });
  }

  if (!payload.comment.in_reply_to_id) {
    return NextResponse.json({ ignored: true });
  }

  const [repo] = await db
    .select({ id: repos.id, userId: repos.userId })
    .from(repos)
    .where(
      and(
        eq(repos.githubId, payload.repository.id),
        eq(repos.isActive, true)
      )
    )
    .limit(1);

  if (!repo) {
    return NextResponse.json({ ignored: true });
  }

  const parentCommentId = payload.comment.in_reply_to_id;

  const completedReviews = await db
    .select({ id: reviews.id, comments: reviews.comments })
    .from(reviews)
    .where(
      and(
        eq(reviews.repoId, repo.id),
        eq(reviews.status, "completed")
      )
    );

  const parentComment = completedReviews
    .flatMap((r) => (r.comments ?? []).map((c) => ({ reviewId: r.id, ...c })))
    .find((c) => c.githubCommentId === parentCommentId);

  if (!parentComment) {
    return NextResponse.json({ ignored: true });
  }

  await inngest.send({
    name: "comment/reply-received",
    data: {
      repoId: repo.id,
      userId: repo.userId,
      prNumber: payload.pull_request.number,
      repoFullName: payload.repository.full_name,
      originalComment: parentComment.body,
      userReply: payload.comment.body,
      replyCommentId: payload.comment.id,
      sourceUrl: payload.comment.html_url,
    },
  });

  return NextResponse.json({ dispatched: true });
}

export async function POST(request: NextRequest) {
  const event = request.headers.get("x-github-event");
  if (!event || !SUPPORTED_EVENTS.has(event)) {
    return NextResponse.json({ ignored: true });
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event === "pull_request") {
    return handlePullRequest(JSON.parse(body));
  }

  return handleReviewComment(JSON.parse(body));
}
