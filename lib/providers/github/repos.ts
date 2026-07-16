import { Octokit } from "@octokit/rest";

import type { RemoteRepo } from "../types";

type FetchReposResult = {
  repos: RemoteRepo[];
  hasNextPage: boolean;
};

export async function listUserRepos(
  token: string,
  page: number = 1,
  perPage: number = 20
): Promise<FetchReposResult> {
  const octokit = new Octokit({ auth: token });

  const response = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    direction: "desc",
    per_page: perPage,
    page,
  });

  const repos: RemoteRepo[] = response.data.map((repo) => ({
    externalId: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    description: repo.description,
    language: repo.language,
    stargazersCount: repo.stargazers_count,
    isPrivate: repo.private,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at ?? new Date().toISOString(),
    htmlUrl: repo.html_url,
  }));

  const linkHeader = response.headers.link ?? "";
  const hasNextPage = linkHeader.includes('rel="next"');

  return { repos, hasNextPage };
}

/** Resolves a single repo by owner/name — used by the CLI connect route, which
 * only has a git remote's `owner/repo` to go on, not a pre-fetched list. */
export async function fetchRepoByFullName(
  token: string,
  owner: string,
  repo: string
): Promise<RemoteRepo | null> {
  const octokit = new Octokit({ auth: token });

  try {
    const response = await octokit.repos.get({ owner, repo });
    const data = response.data;

    return {
      externalId: String(data.id),
      name: data.name,
      fullName: data.full_name,
      owner: data.owner.login,
      description: data.description,
      language: data.language,
      stargazersCount: data.stargazers_count,
      isPrivate: data.private,
      defaultBranch: data.default_branch,
      updatedAt: data.updated_at ?? new Date().toISOString(),
      htmlUrl: data.html_url,
    };
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "status" in e && e.status === 404) {
      return null;
    }
    throw e;
  }
}
