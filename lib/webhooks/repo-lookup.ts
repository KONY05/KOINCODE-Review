import { eq, and, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { repos, reviews } from "@/lib/db/schema";
import type { GitProviderId } from "@/lib/providers/types";

/**
 * Shared by every provider's webhook route — the repo lookup itself never
 * depends on payload shape. webhookSecret is only ever non-null for Azure
 * DevOps repos on the manual webhook-setup path (see
 * app/api/webhooks/azure-devops/route.ts), but selecting it here for every
 * provider is harmless — it stays null for GitHub/GitLab. fullName is
 * likewise only actually needed by the Azure DevOps route (its webhook
 * payload has no reliable way to reconstruct the "organization/project/repo"
 * triple stored in repos.fullName, unlike GitHub's/GitLab's payloads which
 * already carry their own full name directly).
 */
export async function findActiveRepo(provider: GitProviderId, externalId: string) {
  const [repo] = await db
    .select({
      id: repos.id,
      userId: repos.userId,
      webhookSecret: repos.webhookSecret,
      fullName: repos.fullName,
    })
    .from(repos)
    .where(
      and(
        eq(repos.provider, provider),
        eq(repos.externalId, externalId),
        eq(repos.isActive, true),
      ),
    )
    .limit(1);

  return repo ?? null;
}

export async function cancelInFlightReviews(
  repoId: string,
  prNumber: number,
  summary: string,
) {
  const inFlight = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.repoId, repoId),
        eq(reviews.prNumber, prNumber),
        inArray(reviews.status, ["pending", "in_progress"]),
      ),
    );

  if (inFlight.length === 0) return [];

  await db
    .update(reviews)
    .set({ status: "failed", summary })
    .where(
      and(
        eq(reviews.repoId, repoId),
        eq(reviews.prNumber, prNumber),
        inArray(reviews.status, ["pending", "in_progress"]),
      ),
    );

  return inFlight;
}

/** Matches a reply webhook event back to the KOINCODE-authored comment it replied to, regardless of provider. */
export async function findParentReviewComment(repoId: string, providerCommentId: string) {
  const completedReviews = await db
    .select({ id: reviews.id, comments: reviews.comments })
    .from(reviews)
    .where(and(eq(reviews.repoId, repoId), eq(reviews.status, "completed")));

  return (
    completedReviews
      .flatMap((r) => (r.comments ?? []).map((c) => ({ reviewId: r.id, ...c })))
      .find((c) => c.providerCommentId === providerCommentId) ?? null
  );
}
