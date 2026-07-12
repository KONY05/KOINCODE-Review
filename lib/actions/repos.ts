"use server";

import { and, eq, ilike } from "drizzle-orm";

import { db } from "@/lib/db";
import { repos } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { getGithubToken } from "@/lib/github";
import { fetchUserRepos, type GitHubRepo } from "@/lib/github/repos";
import { connectRepoForUser, disconnectRepoForUser } from "@/lib/repos";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";

export type RepoWithStatus = GitHubRepo & {
  isConnected: boolean;
};

type ListReposData = {
  repos: RepoWithStatus[];
  hasNextPage: boolean;
};

export async function listGithubRepos(
  page: number = 1,
  perPage: number = 20,
): Promise<ActionResult<ListReposData>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const token = await getGithubToken();
    if (!token) return fail("GitHub token not found");

    const { repos: githubRepos, hasNextPage } = await fetchUserRepos(
      token,
      page,
      perPage,
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
    return fail("Failed to fetch connected repositories", e);
  }
}

export async function connectRepo(repo: GitHubRepo): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const token = await getGithubToken();
    if (!token) return fail("GitHub token not found");

    await connectRepoForUser(user.id, repo, token);

    await trackServer(EVENTS.REPO_CONNECTED, user.id, {
      repo_name: repo.fullName,
      language: repo.language,
      source: "dashboard",
    });

    return ok(null);
  } catch (e) {
    return fail("Failed to connect repository", e);
  }
}

export async function disconnectRepo(githubId: number): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const token = await getGithubToken();
    const repo = await disconnectRepoForUser(user.id, githubId, token);

    await trackServer(EVENTS.REPO_DISCONNECTED, user.id, {
      repo_name: repo ? `${repo.owner}/${repo.name}` : undefined,
      source: "dashboard",
    });

    return ok(null);
  } catch (e) {
    return fail("Failed to disconnect repository", e);
  }
}
