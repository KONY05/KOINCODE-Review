const ADO_BASE = "https://dev.azure.com";
const VSSPS_BASE = "https://app.vssps.visualstudio.com";
const API_VERSION = "7.1";

export class AzureDevOpsApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function withApiVersion(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}api-version=${API_VERSION}`;
}

async function request(base: string, token: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${base}${withApiVersion(path)}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AzureDevOpsApiError(`Azure DevOps API ${response.status}: ${body}`, response.status);
  }

  return response;
}

/** Organization/project-scoped calls — everything under dev.azure.com/{organization}/... */
export async function azureFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await request(ADO_BASE, token, path, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Account-level calls (listing the organizations a user belongs to) — a different host than every other Azure DevOps endpoint. */
export async function vsspsFetch<T>(token: string, path: string): Promise<T> {
  const response = await request(VSSPS_BASE, token, path);
  return response.json() as Promise<T>;
}

/**
 * Raw file content comes back as JSON metadata by default from the items
 * endpoint — requesting `text/plain` gets the actual file bytes instead,
 * mirroring GitLab's gitlabFetchText / GitHub's raw content fetch.
 */
export async function azureFetchText(token: string, path: string): Promise<string | null> {
  const response = await fetch(`${ADO_BASE}${withApiVersion(path)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/plain" },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new AzureDevOpsApiError(`Azure DevOps API ${response.status}`, response.status);
  }

  return response.text();
}

/**
 * Azure DevOps's owner encodes "organization/project" (see the Architecture
 * Mismatch section of the Feature 19 spec) — every project- or repo-scoped
 * endpoint needs both segments split back out. Splits on the *first* `/`
 * (unlike splitRepoFullName's last-`/` split) since the project name itself
 * can't contain a `/`, but this is the inverse operation on a different pair
 * of segments.
 */
export function splitOwner(owner: string): { organization: string; project: string } {
  const firstSlash = owner.indexOf("/");
  if (firstSlash === -1) {
    throw new Error(`Azure DevOps owner "${owner}" is missing the organization/project separator`);
  }
  return { organization: owner.slice(0, firstSlash), project: owner.slice(firstSlash + 1) };
}

/**
 * Azure DevOps's versionDescriptor requires an explicit versionType, and
 * GitProvider's shared interface passes `ref` as either a branch name
 * (fetchRepoTree's defaultBranch) or a commit SHA (every PR/push-diffing
 * call site's reviewSha/headSha) depending on caller — GitHub/GitLab don't
 * need this distinction since their APIs accept either transparently.
 */
export function refVersionType(ref: string): "commit" | "branch" {
  return /^[0-9a-f]{7,40}$/i.test(ref) ? "commit" : "branch";
}
