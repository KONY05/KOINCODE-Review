import { Octokit } from "@octokit/rest";

export interface GitHubRepo {
  githubId: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
}

type FetchReposResult = {
  repos: GitHubRepo[];
  hasNextPage: boolean;
};

export async function fetchUserRepos(
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

  const repos: GitHubRepo[] = response.data.map((repo) => ({
    githubId: repo.id,
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
