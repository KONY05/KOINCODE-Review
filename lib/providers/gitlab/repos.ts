import type { RemoteRepo } from "../types";
import { GitLabApiError, gitlabFetch, gitlabFetchPaginated, projectPath } from "./client";

type GitlabProject = {
  id: number;
  name: string;
  path_with_namespace: string;
  namespace: { full_path: string };
  description: string | null;
  star_count: number;
  visibility: string;
  default_branch: string | null;
  last_activity_at: string;
  web_url: string;
};

// GitLab's project list/detail endpoints don't surface a primary language the
// way GitHub's repo object does (that needs a separate per-project
// /languages call) — left null rather than firing an extra request per repo
// in a paginated list.
function toRemoteRepo(p: GitlabProject): RemoteRepo {
  return {
    externalId: String(p.id),
    name: p.name,
    fullName: p.path_with_namespace,
    owner: p.namespace.full_path,
    description: p.description,
    language: null,
    stargazersCount: p.star_count,
    isPrivate: p.visibility !== "public",
    defaultBranch: p.default_branch ?? "main",
    updatedAt: p.last_activity_at,
    htmlUrl: p.web_url,
  };
}

export async function listUserRepos(
  token: string,
  page: number = 1,
  perPage: number = 20,
): Promise<{ repos: RemoteRepo[]; hasNextPage: boolean }> {
  // No order_by/sort at all — confirmed via live testing that GitLab's API
  // 500s on membership=true + order_by/sort (tried both last_activity_at
  // and updated_at) when authenticated via an OAuth Bearer token, even
  // though the identical membership=true query with no sort params
  // succeeds fine via a Personal Access Token. Apparently OAuth-token-
  // authenticated requests hit a different, broken code path for sorted
  // membership queries on GitLab's end. Dropping sorting entirely sidesteps
  // it; GitLab's own default ordering (created_at) applies instead.
  const { items, hasNextPage } = await gitlabFetchPaginated<GitlabProject[]>(
    token,
    `/projects?membership=true&per_page=${perPage}&page=${page}`,
  );

  return { repos: items.map(toRemoteRepo), hasNextPage };
}

/** Resolves a single repo by owner/name — mirrors GitHub's fetchRepoByFullName for the CLI connect route. */
export async function fetchRepoByFullName(
  token: string,
  owner: string,
  repo: string,
): Promise<RemoteRepo | null> {
  try {
    const project = await gitlabFetch<GitlabProject>(
      token,
      `/projects/${projectPath(owner, repo)}`,
    );
    return toRemoteRepo(project);
  } catch (e: unknown) {
    if (e instanceof GitLabApiError && e.status === 404) {
      return null;
    }
    throw e;
  }
}
