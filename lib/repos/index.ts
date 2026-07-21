import { eq, and, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { repos, reviews } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers/registry";
import { inngest } from "@/lib/inngest/client";
import type { GitProviderId, RemoteRepo } from "@/lib/providers/types";

// Shared connect/disconnect tail, used by both the dashboard's server actions
// (lib/actions/repos.ts, which resolve the user via a Clerk session) and the
// CLI's bearer-token-authed routes (app/api/cli/repos/*, which resolve the
// user via requireCliToken) — both paths must end up doing the exact same
// webhook/DB/indexing work so behavior never drifts between entry points.
// Deliberately not a "use server" file: these take an already-resolved
// `userId` as a plain argument, so they must not be reachable as a
// client-callable Server Action.

export async function connectRepoForUser(
  userId: string,
  provider: GitProviderId,
  repo: RemoteRepo,
  token: string,
): Promise<{ id: string; indexingStatus: string; manualWebhookSecret?: string }> {
  const result = await db.transaction(async (tx) => {
    const [upserted] = await tx
      .insert(repos)
      .values({
        userId,
        provider,
        externalId: repo.externalId,
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        defaultBranch: repo.defaultBranch,
        isPrivate: repo.isPrivate,
        isActive: true,
        indexingStatus: "pending",
        disconnectedAt: null,
      })
      .onConflictDoUpdate({
        target: [repos.userId, repos.provider, repos.externalId],
        set: {
          isActive: true,
          disconnectedAt: null,
          fullName: repo.fullName,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
        },
      })
      .returning({
        id: repos.id,
        indexingStatus: repos.indexingStatus,
        webhookId: repos.webhookId,
      });

    let manualWebhookSecret: string | undefined;

    if (!upserted.webhookId) {
      const webhookResult = await getProvider(provider).createRepoWebhook(
        token,
        repo.owner,
        repo.name,
      );

      if (webhookResult.status === "created") {
        await tx
          .update(repos)
          .set({ webhookId: webhookResult.webhookId })
          .where(eq(repos.id, upserted.id));
      } else {
        // Azure DevOps only, when vso.hooks_write wasn't grantable — no
        // webhookId to store, just the per-repo secret the user still needs
        // to paste into the provider's own webhook UI themselves (see
        // context/feature-spec/19-azure-devops-integration.md).
        await tx
          .update(repos)
          .set({ webhookSecret: webhookResult.secret })
          .where(eq(repos.id, upserted.id));
        manualWebhookSecret = webhookResult.secret;
      }
    }

    return { ...upserted, manualWebhookSecret };
  });

  if (result.indexingStatus !== "completed") {
    await inngest.send({
      name: "repo/connected",
      data: {
        repoId: result.id,
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        token,
      },
    });
  }

  return result;
}

export async function disconnectRepoForUser(
  userId: string,
  provider: GitProviderId,
  externalId: string,
  token: string | null,
): Promise<{ owner: string; name: string } | null> {
  // Wrapped in a transaction, mirroring connectRepoForUser's shape above —
  // the UPDATE...RETURNING (instead of a separate SELECT-then-UPDATE) is
  // already atomic on its own for the single-row write, but the transaction
  // keeps this consistent with the rest of the file and gives room for any
  // future write that needs to join the same unit of work.
  return db.transaction(async (tx) => {
    const [repo] = await tx
      .update(repos)
      .set({ isActive: false, disconnectedAt: new Date(), webhookId: null })
      .where(
        and(
          eq(repos.userId, userId),
          eq(repos.provider, provider),
          eq(repos.externalId, externalId),
        ),
      )
      .returning({
        webhookId: repos.webhookId,
        owner: repos.owner,
        name: repos.name,
      });

    if (!repo) return null;

    // Webhook deletion is a best-effort external call — same as
    // connectRepoForUser's createRepoWebhook call above, it runs inside the
    // transaction so a failure here doesn't leave the DB write half-applied,
    // using the webhookId that came back atomically from the UPDATE itself.
    if (repo.webhookId && token) {
      try {
        await getProvider(provider).deleteRepoWebhook(
          token,
          repo.owner,
          repo.name,
          repo.webhookId,
        );
      } catch (e) {
        console.error("Failed to delete webhook:", e);
      }
    }

    return { owner: repo.owner, name: repo.name };
  });
}

/** Looked up by (owner, name) rather than externalId — the CLI only has a git
 * remote's owner/repo to go on, and going through the DB here avoids an extra
 * provider API round trip that connecting doesn't need for a disconnect.
 * Filtered by provider too — without it, a user with a GitHub repo and a
 * GitLab repo sharing the same (owner, name) (plausible for a mirrored repo)
 * would silently match whichever row comes back first. */
export async function findConnectedRepoExternalId(
  userId: string,
  provider: GitProviderId,
  owner: string,
  name: string,
): Promise<string | null> {
  const [repo] = await db
    .select({ externalId: repos.externalId })
    .from(repos)
    .where(
      and(
        eq(repos.userId, userId),
        eq(repos.provider, provider),
        eq(repos.owner, owner),
        eq(repos.name, name),
        eq(repos.isActive, true),
      ),
    )
    .limit(1);

  return repo?.externalId ?? null;
}

export type RepoStatus =
  | { connected: false }
  | {
      connected: true;
      indexingStatus: string;
      lastReview: {
        status: string;
        prNumber: number;
        prTitle: string;
        createdAt: string;
      } | null;
    };

export async function getRepoStatusForUser(
  userId: string,
  provider: GitProviderId,
  owner: string,
  name: string,
): Promise<RepoStatus> {
  const [repo] = await db
    .select({ id: repos.id, indexingStatus: repos.indexingStatus })
    .from(repos)
    .where(
      and(
        eq(repos.userId, userId),
        eq(repos.provider, provider),
        eq(repos.owner, owner),
        eq(repos.name, name),
        eq(repos.isActive, true),
      ),
    )
    .limit(1);

  if (!repo) return { connected: false };

  const [lastReview] = await db
    .select({
      status: reviews.status,
      prNumber: reviews.prNumber,
      prTitle: reviews.prTitle,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(eq(reviews.repoId, repo.id))
    .orderBy(desc(reviews.createdAt))
    .limit(1);

  return {
    connected: true,
    indexingStatus: repo.indexingStatus,
    lastReview: lastReview
      ? { ...lastReview, createdAt: lastReview.createdAt.toISOString() }
      : null,
  };
}
