import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { env } from "@/config/env";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";
import { findActiveRepo, cancelInFlightReviews } from "@/lib/webhooks/repo-lookup";

type ActiveRepo = NonNullable<Awaited<ReturnType<typeof findActiveRepo>>>;

type PullRequestResource = {
  repository: { id: string; name: string };
  pullRequestId: number;
  status: "active" | "completed" | "abandoned";
  title: string;
  sourceRefName: string;
  targetRefName: string;
  isDraft?: boolean;
  lastMergeSourceCommit: { commitId: string };
  url: string;
};

type ServiceHookPayload = {
  eventType: "git.pullrequest.created" | "git.pullrequest.updated" | string;
  resource: PullRequestResource;
  resourceContainers: { account: { baseUrl: string } };
};

function stripRefsHeads(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

function buildPrWebUrl(baseUrl: string, projectName: string, repoName: string, prId: number): string {
  return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(repoName)}/pullrequest/${prId}`;
}

/**
 * Azure DevOps service hooks authenticate via Basic Auth, not an HMAC
 * signature the way GitHub's X-Hub-Signature-256 or GitLab's X-Gitlab-Token
 * do — so verification here checks the request's Basic Auth password
 * against whichever secret applies to *this specific repo* (the shared
 * platform secret for auto-created subscriptions, or a per-repo secret for
 * the manual-setup fallback). That means, unlike GitHub/GitLab, verification
 * can't happen before the repo lookup — it depends on which repo the
 * payload claims to be for.
 */
function verifyBasicAuth(request: NextRequest, expectedSecret: string): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const password = Buffer.from(decoded.slice(separatorIndex + 1));
  const expected = Buffer.from(expectedSecret);
  if (password.length !== expected.length) return false;

  return crypto.timingSafeEqual(password, expected);
}

async function handlePullRequestCreated(payload: ServiceHookPayload, repo: ActiveRepo) {
  const resource = payload.resource;
  if (resource.isDraft) return NextResponse.json({ ignored: true });

  const prUrl = buildPrWebUrl(
    payload.resourceContainers.account.baseUrl,
    // repos.fullName is "organization/project/repo" — the middle segment is
    // the project name the PR web URL needs.
    repo.fullName.split("/").slice(1, -1).join("/"),
    resource.repository.name,
    resource.pullRequestId,
  );

  const [review] = await db
    .insert(reviews)
    .values({
      repoId: repo.id,
      userId: repo.userId,
      prNumber: resource.pullRequestId,
      prTitle: resource.title,
      prUrl,
      status: "pending",
    })
    .returning({ id: reviews.id });

  await inngest.send({
    name: "pr/review-requested",
    data: {
      reviewId: review.id,
      repoId: repo.id,
      userId: repo.userId,
      prNumber: resource.pullRequestId,
      prTitle: resource.title,
      prUrl,
      headSha: resource.lastMergeSourceCommit.commitId,
      headBranch: stripRefsHeads(resource.sourceRefName),
      baseBranch: stripRefsHeads(resource.targetRefName),
      repoFullName: repo.fullName,
    },
  });

  await trackServer(EVENTS.REVIEW_REQUESTED, repo.userId, {
    repo_name: repo.fullName,
    pr_number: resource.pullRequestId,
  });

  return NextResponse.json({ reviewId: review.id });
}

async function handlePullRequestUpdated(payload: ServiceHookPayload, repo: ActiveRepo) {
  const resource = payload.resource;

  if (resource.status === "active") {
    // Known gap (see lib/providers/azure-devops/webhooks.ts): this event
    // fires for every PR metadata edit, not specifically "new commits
    // pushed" — no before/after commit shas are in the payload to tell
    // those apart, so re-review-on-push and adoption tracking aren't
    // triggered for Azure DevOps in this pass.
    return NextResponse.json({ ignored: true });
  }

  const merged = resource.status === "completed";

  if (merged) {
    await inngest.send({
      name: "pr/adoption-summary",
      data: {
        repoId: repo.id,
        userId: repo.userId,
        prNumber: resource.pullRequestId,
        repoFullName: repo.fullName,
      },
    });
  }

  const summary = merged
    ? "Review cancelled — PR was merged."
    : "Review cancelled — PR was closed.";

  const cancelled = await cancelInFlightReviews(repo.id, resource.pullRequestId, summary);
  if (cancelled.length === 0) return NextResponse.json({ ignored: true });

  const events = cancelled.map((r) => ({
    name: "pr/review-cancelled" as const,
    data: {
      reviewId: r.id,
      repoId: repo.id,
      repoFullName: repo.fullName,
      headSha: resource.lastMergeSourceCommit.commitId,
      userId: repo.userId,
    },
  }));

  await inngest.send(events);

  await trackServer(EVENTS.REVIEW_CANCELLED, repo.userId, {
    repo_name: repo.fullName,
    pr_number: resource.pullRequestId,
    reason: merged ? "merged" : "closed",
    cancelled_count: cancelled.length,
  });

  return NextResponse.json({ cancelled: cancelled.length });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as ServiceHookPayload | null;
  if (!payload?.resource?.repository?.id) {
    return NextResponse.json({ ignored: true });
  }

  const repo = await findActiveRepo("azure_devops", payload.resource.repository.id);
  if (!repo) return NextResponse.json({ ignored: true });

  const expectedSecret = repo.webhookSecret ?? env.AZURE_DEVOPS_WEBHOOK_SECRET;
  if (!expectedSecret || !verifyBasicAuth(request, expectedSecret)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (payload.eventType === "git.pullrequest.created") {
    return handlePullRequestCreated(payload, repo);
  }

  if (payload.eventType === "git.pullrequest.updated") {
    return handlePullRequestUpdated(payload, repo);
  }

  return NextResponse.json({ ignored: true });
}
