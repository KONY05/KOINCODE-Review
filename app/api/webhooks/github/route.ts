import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/lib/db";
import { repos, reviews } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";

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
  pull_request: {
    title: string;
    html_url: string;
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

const REVIEWABLE_ACTIONS = new Set<PullRequestAction>(["opened", "synchronize"]);

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

export async function POST(request: NextRequest) {
  const event = request.headers.get("x-github-event");
  if (event !== "pull_request") {
    return NextResponse.json({ ignored: true });
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: PullRequestPayload = JSON.parse(body);

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

  return NextResponse.json({ reviewId: review.id });
}
