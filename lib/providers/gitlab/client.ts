const GITLAB_API_BASE = "https://gitlab.com/api/v4";

// gitlab.com only for this pass — self-hosted GitLab instances would need a
// per-repo base URL stored somewhere, which isn't requested scope yet.
export class GitLabApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${GITLAB_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GitLabApiError(`GitLab API ${response.status}: ${body}`, response.status);
  }

  return response;
}

export async function gitlabFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await request(token, path, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Returns the raw text body, or null on 404 (mirrors GitHub's fetchFileContent not-found handling). */
export async function gitlabFetchText(
  token: string,
  path: string,
): Promise<string | null> {
  const response = await fetch(`${GITLAB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GitLabApiError(`GitLab API ${response.status}`, response.status);
  }

  return response.text();
}

export function hasNextPage(response: Response): boolean {
  const linkHeader = response.headers.get("link") ?? "";
  return linkHeader.includes('rel="next"');
}

export async function gitlabFetchPaginated<T>(
  token: string,
  path: string,
): Promise<{ items: T; hasNextPage: boolean }> {
  const response = await request(token, path);
  return { items: (await response.json()) as T, hasNextPage: hasNextPage(response) };
}

/** GitLab's `:id` path param accepts a URL-encoded `namespace/path` string in place of the numeric project id. */
export function projectPath(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}
