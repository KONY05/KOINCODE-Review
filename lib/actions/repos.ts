"use server";

import { and, eq, ilike } from "drizzle-orm";

import { db } from "@/lib/db";
import { repos } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { getGithubToken } from "@/lib/github";
import { fetchUserRepos, type GitHubRepo } from "@/lib/github/repos";
import { createRepoWebhook, deleteRepoWebhook } from "@/lib/github/webhooks";
import { inngest } from "@/lib/inngest/client";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

export type RepoWithStatus = GitHubRepo & {
  isConnected: boolean;
};

type ListReposData = {
  repos: RepoWithStatus[];
  hasNextPage: boolean;
};

export async function listGithubRepos(
  page: number = 1,
  perPage: number = 20
): Promise<ActionResult<ListReposData>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const token = await getGithubToken();
    if (!token) return fail("GitHub token not found");

    const { repos: githubRepos, hasNextPage } = await fetchUserRepos(
      token,
      page,
      perPage
    );

    const connectedRepos = await db
      .select({ githubId: repos.githubId })
      .from(repos)
      .where(and(eq(repos.userId, user.id), eq(repos.isActive, true)));

    const connectedIds = new Set(connectedRepos.map((r) => r.githubId));

    const reposWithStatus: RepoWithStatus[] = githubRepos.map((repo) => ({
      ...repo,
      isConnected: connectedIds.has(repo.githubId),
    }));

    return ok({ repos: reposWithStatus, hasNextPage });
  } catch (e) {
    return fail("Failed to fetch repositories", e);
  }
}

export async function listConnectedRepos(
  page: number = 1,
  perPage: number = 20,
  search?: string
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
      githubId: r.githubId,
      name: r.name,
      fullName: r.fullName,
      owner: r.owner,
      description: null,
      language: null,
      stargazersCount: 0,
      isPrivate: r.isPrivate,
      defaultBranch: r.defaultBranch,
      updatedAt: r.updatedAt.toISOString(),
      htmlUrl: `https://github.com/${r.fullName}`,
      isConnected: true,
    }));

    return ok({ repos: reposWithStatus, hasNextPage });
  } catch (e) {
    return fail(
      "Failed to fetch connected repositories", e
    );
  }
}

export async function connectRepo(
  repo: GitHubRepo
): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const token = await getGithubToken();
    if (!token) return fail("GitHub token not found");

    const result = await db.transaction(async (tx) => {
      const [upserted] = await tx
        .insert(repos)
        .values({
          userId: user.id,
          githubId: repo.githubId,
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
          target: [repos.userId, repos.githubId],
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

      if (!upserted.webhookId) {
        const webhookId = await createRepoWebhook(
          token,
          repo.owner,
          repo.name
        );
        await tx
          .update(repos)
          .set({ webhookId })
          .where(eq(repos.id, upserted.id));
      }

      return upserted;
    });

    if (result.indexingStatus !== "completed") {
      await inngest.send({
        name: "repo/connected",
        data: {
          repoId: result.id,
          owner: repo.owner,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
          githubToken: token,
        },
      });
    }

    return ok(null);
  } catch (e) {
    return fail("Failed to connect repository", e);
  }
}

export async function disconnectRepo(
  githubId: number
): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const token = await getGithubToken();

    const [repo] = await db
      .select({
        webhookId: repos.webhookId,
        owner: repos.owner,
        name: repos.name,
      })
      .from(repos)
      .where(and(eq(repos.userId, user.id), eq(repos.githubId, githubId)))
      .limit(1);

    if (repo?.webhookId && token) {
      try {
        await deleteRepoWebhook(token, repo.owner, repo.name, repo.webhookId);
      } catch (e) {
        console.error("Failed to delete webhook:", e);
      }
    }

    await db
      .update(repos)
      .set({ isActive: false, disconnectedAt: new Date(), webhookId: null })
      .where(and(eq(repos.userId, user.id), eq(repos.githubId, githubId)));

    return ok(null);
  } catch (e) {
    return fail(
      "Failed to disconnect repository", e
    );
  }
}
