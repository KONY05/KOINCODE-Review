"use server";

import { and, eq, ilike } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/lib/db";
import { repos } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { getProvider } from "@/lib/providers/registry";
import { gitProviderIdForClerkSlug } from "@/lib/providers/clerk-mapping";
import type { GitProviderId, RemoteRepo } from "@/lib/providers/types";
import { connectRepoForUser, disconnectRepoForUser } from "@/lib/repos";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";
import { currentUser } from "@clerk/nextjs/server";

export type RepoWithStatus = RemoteRepo & {
  isConnected: boolean;
  provider: GitProviderId;
};

type ListReposData = {
  repos: RepoWithStatus[];
  hasNextPage: boolean;
};

/**
 * The git providers the signed-in user has actually linked a Clerk OAuth
 * connection for — drives the repos page's provider selector so an account
 * never sees a provider it can't fetch repos from.
 *
 * Requires verification.status === "verified", not just presence in
 * externalAccounts — Clerk creates an external-account row as soon as an
 * OAuth flow *starts*, before it's known to succeed. A denied/failed
 * authorization (e.g. Microsoft's oauth_access_denied when Entra admin
 * consent wasn't granted) still leaves a row behind with every actual field
 * empty, which would otherwise show up here as "linked" despite there
 * being no usable token behind it at all.
 */
export async function listLinkedProviders(): Promise<GitProviderId[]> {
  const clerkUser = await currentUser();
  if (!clerkUser) return [];

  const linked = new Set<GitProviderId>();
  for (const account of clerkUser.externalAccounts) {
    if (account.verification?.status !== "verified") continue;
    const providerId = gitProviderIdForClerkSlug(account.provider);
    if (providerId) linked.add(providerId);
  }

  return [...linked];
}

export async function listProviderRepos(
  provider: GitProviderId,
  page: number = 1,
  perPage: number = 20,
): Promise<ActionResult<ListReposData>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const clerkUser = await currentUser();
    if (!clerkUser) return fail("Unauthorized");

    const token = await getProvider(provider).getTokenForClerkUser(clerkUser.id);
    if (!token) return fail(`${provider} token not found`);

    const { repos: providerRepos, hasNextPage } = await getProvider(provider).listUserRepos(
      token,
      page,
      perPage,
    );

    const connectedRepos = await db
      .select({ externalId: repos.externalId })
      .from(repos)
      .where(
        and(
          eq(repos.userId, user.id),
          eq(repos.provider, provider),
          eq(repos.isActive, true),
        ),
      );

    const connectedIds = new Set(connectedRepos.map((r) => r.externalId));

    const reposWithStatus: RepoWithStatus[] = providerRepos.map((repo) => ({
      ...repo,
      isConnected: connectedIds.has(repo.externalId),
      provider,
    }));

    return ok({ repos: reposWithStatus, hasNextPage });
  } catch (e) {
    return fail("Failed to fetch repositories", e);
  }
}

export async function listConnectedRepos(
  page: number = 1,
  perPage: number = 20,
  search?: string,
): Promise<ActionResult<ListReposData>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const conditions = [eq(repos.userId, user.id), eq(repos.isActive, true)];
    if (search) {
      conditions.push(ilike(repos.name, `%${search}%`));
    }

    const connectedRepos = await db
      .select()
      .from(repos)
      .where(and(...conditions))
      .limit(perPage + 1) // +1 is a trick to check if we have more than what we requested so we can implement the next page
      .offset((page - 1) * perPage);

    const hasNextPage = connectedRepos.length > perPage;
    const sliced = hasNextPage
      ? connectedRepos.slice(0, perPage)
      : connectedRepos;

    const reposWithStatus: RepoWithStatus[] = sliced.map((r) => ({
      externalId: r.externalId,
      name: r.name,
      fullName: r.fullName,
      owner: r.owner,
      description: null,
      language: null,
      stargazersCount: 0,
      isPrivate: r.isPrivate,
      defaultBranch: r.defaultBranch,
      updatedAt: r.updatedAt.toISOString(),
      htmlUrl: buildRepoHtmlUrl(r.provider, r.fullName),
      isConnected: true,
      provider: r.provider,
    }));

    return ok({ repos: reposWithStatus, hasNextPage });
  } catch (e) {
    return fail("Failed to fetch connected repositories", e);
  }
}

/** Only needed for the "Connected" tab's synthesized RepoWithStatus rows above — the "All" tab's repos already carry a real htmlUrl straight from each provider's own API. */
function buildRepoHtmlUrl(provider: GitProviderId, fullName: string): string {
  if (provider === "gitlab") return `https://gitlab.com/${fullName}`;
  if (provider === "azure_devops") {
    // fullName is "organization/project/repo" (see the Feature 19 spec's
    // hierarchy-mismatch decision) — Azure DevOps's web UI path is
    // {org}/{project}/_git/{repo}, not a plain fullName join.
    const lastSlash = fullName.lastIndexOf("/");
    const orgAndProject = fullName.slice(0, lastSlash);
    const repoName = fullName.slice(lastSlash + 1);
    return `https://dev.azure.com/${orgAndProject}/_git/${repoName}`;
  }
  return `https://github.com/${fullName}`;
}

export type ConnectRepoResult = {
  /**
   * Only set for Azure DevOps repos where the auto-create webhook path
   * 403'd (vso.hooks_write wasn't grantable) — the user has to paste this
   * into Azure DevOps's own Service Hooks UI themselves. webhookUrl is
   * included alongside it so the connect dialog can show the exact value to
   * paste without needing APP_URL client-side.
   */
  manualWebhookSecret?: string;
  webhookUrl?: string;
};

export async function connectRepo(
  repo: RemoteRepo,
  provider: GitProviderId,
): Promise<ActionResult<ConnectRepoResult>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const clerkUser = await currentUser();
    if (!clerkUser) return fail("Unauthorized");

    const token = await getProvider(provider).getTokenForClerkUser(clerkUser.id);
    if (!token) return fail(`${provider} token not found`);

    const result = await connectRepoForUser(user.id, provider, repo, token);

    await trackServer(EVENTS.REPO_CONNECTED, user.id, {
      repo_name: repo.fullName,
      language: repo.language,
      source: "dashboard",
    });

    return ok(
      result.manualWebhookSecret
        ? {
            manualWebhookSecret: result.manualWebhookSecret,
            webhookUrl: `${env.APP_URL}/api/webhooks/azure-devops`,
          }
        : {},
    );
  } catch (e) {
    return fail("Failed to connect repository", e);
  }
}

export async function disconnectRepo(
  externalId: string,
  provider: GitProviderId,
): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const clerkUser = await currentUser();
    const token = clerkUser
      ? await getProvider(provider).getTokenForClerkUser(clerkUser.id)
      : null;

    const repo = await disconnectRepoForUser(user.id, provider, externalId, token);

    await trackServer(EVENTS.REPO_DISCONNECTED, user.id, {
      repo_name: repo ? `${repo.owner}/${repo.name}` : undefined,
      source: "dashboard",
    });

    return ok(null);
  } catch (e) {
    return fail("Failed to disconnect repository", e);
  }
}

/**
 * Called from Settings > Connections right before unlinking a git provider
 * (see GitProviderConnections.tsx) — must run while the Clerk external
 * account still exists, since deleting each repo's webhook needs a valid
 * token that won't be retrievable anymore once the account is unlinked.
 * Same soft-deactivate every individual disconnectRepo call already does
 * (isActive=false, disconnectedAt=now(), webhookId cleared, best-effort
 * webhook deletion) — the existing 30-day cleanupDisconnectedRepos cron
 * handles the actual Pinecone/DB row cleanup later, nothing new needed here.
 */
export async function disconnectAllReposForProvider(
  provider: GitProviderId,
): Promise<ActionResult<{ disconnectedCount: number }>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const clerkUser = await currentUser();
    const token = clerkUser
      ? await getProvider(provider).getTokenForClerkUser(clerkUser.id)
      : null;

    const activeRepos = await db
      .select({ externalId: repos.externalId })
      .from(repos)
      .where(
        and(
          eq(repos.userId, user.id),
          eq(repos.provider, provider),
          eq(repos.isActive, true),
        ),
      );

    for (const repo of activeRepos) {
      await disconnectRepoForUser(user.id, provider, repo.externalId, token);
    }

    if (activeRepos.length > 0) {
      await trackServer(EVENTS.REPO_DISCONNECTED, user.id, {
        repo_name: `all ${provider} repos`,
        source: "provider-unlink",
      });
    }

    return ok({ disconnectedCount: activeRepos.length });
  } catch (e) {
    return fail("Failed to disconnect repositories", e);
  }
}
