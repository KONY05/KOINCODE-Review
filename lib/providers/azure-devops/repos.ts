import type { RemoteRepo } from "../types";
import { AzureDevOpsApiError, azureFetch, vsspsFetch, splitOwner } from "./client";

type AzureProfile = { id: string };
type AzureAccount = { accountName: string };
type AzureProject = { id: string; name: string };
type AzureRepository = {
  id: string;
  name: string;
  webUrl: string;
  defaultBranch?: string;
  isDisabled?: boolean;
  project: { name: string };
};

function stripRefsHeads(ref: string | undefined): string {
  return ref?.replace(/^refs\/heads\//, "") ?? "main";
}

function toRemoteRepo(organization: string, r: AzureRepository): RemoteRepo {
  return {
    externalId: r.id,
    name: r.name,
    fullName: `${organization}/${r.project.name}/${r.name}`,
    owner: `${organization}/${r.project.name}`,
    description: null,
    // Azure DevOps doesn't expose a primary language on the repo/list
    // endpoints (same gap as GitLab — would need a per-repo extra call).
    language: null,
    stargazersCount: 0,
    // Azure DevOps orgs are effectively always private (no public-repo
    // browsing concept the way GitHub/GitLab have); there's no per-repo
    // visibility flag on this endpoint to check instead.
    isPrivate: true,
    defaultBranch: stripRefsHeads(r.defaultBranch),
    // Not available on the repository list/get response — Azure DevOps would
    // need a separate per-repo commits call to get a real last-activity
    // timestamp, too expensive to do per row in a paginated list. Left as
    // "now" rather than inventing a misleading historical date.
    updatedAt: new Date().toISOString(),
    htmlUrl: r.webUrl,
  };
}

/** The organizations (accounts) a user belongs to — Azure DevOps has no single global "list my repos" call, so this is the first step of listUserRepos's fan-out. Lives on a different host (vssps) than every other Azure DevOps API call. */
async function listUserOrganizations(token: string): Promise<string[]> {
  const profile = await vsspsFetch<AzureProfile>(token, "/_apis/profile/profiles/me");
  const accounts = await vsspsFetch<{ value: AzureAccount[] }>(
    token,
    `/_apis/accounts?memberId=${profile.id}`,
  );
  return accounts.value.map((a) => a.accountName);
}

/**
 * Azure DevOps has no flat "list all my repos" endpoint the way GitHub's
 * listForAuthenticatedUser does (see the Feature 19 spec) — this fans out
 * organization -> project -> repository and flattens the result. There's no
 * true cross-organization page token to drive server-side pagination with,
 * so `page`/`perPage` are applied as an in-memory slice over the fully
 * fetched list rather than lazily fetched — fine for the connect-repo
 * browsing UI's expected data sizes, but this does mean every call re-walks
 * every org/project the user belongs to.
 */
export async function listUserRepos(
  token: string,
  page: number = 1,
  perPage: number = 20,
): Promise<{ repos: RemoteRepo[]; hasNextPage: boolean }> {
  const organizations = await listUserOrganizations(token);

  const allRepos: RemoteRepo[] = [];
  for (const organization of organizations) {
    const projects = await azureFetch<{ value: AzureProject[] }>(
      token,
      `/${organization}/_apis/projects`,
    );

    for (const project of projects.value) {
      const repositories = await azureFetch<{ value: AzureRepository[] }>(
        token,
        `/${organization}/${encodeURIComponent(project.name)}/_apis/git/repositories`,
      );

      for (const r of repositories.value) {
        if (r.isDisabled) continue;
        allRepos.push(toRemoteRepo(organization, r));
      }
    }
  }

  const start = (page - 1) * perPage;
  const slice = allRepos.slice(start, start + perPage);

  return { repos: slice, hasNextPage: start + perPage < allRepos.length };
}

/** Resolves a single repo by owner ("organization/project") + name — mirrors GitHub's/GitLab's fetchRepoByFullName for the CLI connect route. */
export async function fetchRepoByFullName(
  token: string,
  owner: string,
  repo: string,
): Promise<RemoteRepo | null> {
  const { organization, project } = splitOwner(owner);

  try {
    const found = await azureFetch<AzureRepository>(
      token,
      `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}`,
    );
    return toRemoteRepo(organization, found);
  } catch (e: unknown) {
    if (e instanceof AzureDevOpsApiError && e.status === 404) {
      return null;
    }
    throw e;
  }
}
