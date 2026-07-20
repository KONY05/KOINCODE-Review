/**
 * Splits a stored `repos.fullName` into (owner, repo). GitHub/GitLab use
 * `owner/repo` (2 segments); Azure DevOps's `owner` column itself contains a
 * `/` (it's `organization/project`), making `fullName` 3 segments
 * (`organization/project/repo`). Splitting on the *last* `/` rather than
 * every `/` handles all three uniformly — the trailing segment is always the
 * repo name, and everything before it is always the owner, regardless of how
 * many segments the owner itself contains.
 */
export function splitRepoFullName(fullName: string): { owner: string; repo: string } {
  const lastSlash = fullName.lastIndexOf("/");
  return {
    owner: fullName.slice(0, lastSlash),
    repo: fullName.slice(lastSlash + 1),
  };
}
