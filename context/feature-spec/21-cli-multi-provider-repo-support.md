# Feature 21: CLI Multi-Provider Repo Support (Server Side)

## Overview

The CLI integration (`/api/cli/repos/*`, Feature 14) is still 100% GitHub-only — checked against the actual CLI codebase (`/Users/mac/Documents/Code/KOINCODE`) rather than assumed. This spec covers the server-side half of making it provider-aware; the CLI-side half (git remote parsing, request shape) is a separate spec living in that repo (`context/feature-specs/44-cli-multi-provider-repo-support.md`), since the two repos are worked on in separate sessions. The two specs must stay in lockstep on the wire contract — this document is the source of truth for that contract.

## Confirmed Findings From the CLI Repo

- `lib/review/review-repo.ts`'s `resolveCurrentRepo()` parses `git remote get-url origin` with a single hardcoded regex (`github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$`) and returns `{ok: false, reason: "not-github"}` for anything else — GitLab/Azure DevOps remotes are explicitly rejected today, not silently mishandled.
- `lib/review/review-api.ts`'s `connectRepo`/`disconnectRepo`/`getRepoStatus` send `{owner, repo}` only (JSON body for connect/disconnect, query string for status) — no provider field exists on the wire today.
- Error copy ("Only GitHub repositories are supported") appears in three places: `commands.tsx`'s `/review-connect` and `/review-disconnect`, and `review-status-dialog.tsx`.
- The CLI's bearer-token auth (`~/.koincode/review-auth.json`, `{token, userId}`) is provider-agnostic already — it authenticates against the KOINCODE-Review *account*, not any specific git host. No CLI-side auth changes needed; this is purely a repo-identification and request-shape change.

## Wire Contract Change

`repoRefSchema` (`lib/cli/schemas.ts`) gains an optional `provider` field, **defaulting to `"github"`**:

```ts
export const repoRefSchema = z.object({
  owner: z.string().min(1).max(100), // widened from 39 — Azure DevOps owner is "organization/project", can exceed a single GitHub username's length
  repo: z.string().min(1).max(100),
  provider: z.enum(["github", "gitlab", "azure_devops"]).default("github"),
});
```

**Why optional-with-default, not required:** already-installed CLI binaries will keep sending `{owner, repo}` with no `provider` field until users update. Defaulting to `"github"` means those installs keep working unmodified — this is the same backward-compatible pattern that let Feature 14 ship without breaking existing CLI installs when the DB schema evolved. New CLI versions (once the CLI-side spec ships) send `provider` explicitly.

**Azure DevOps's `owner` shape**: unchanged from how the rest of this app already handles it (`lib/providers/azure-devops/*`) — `owner` is the combined `"organization/project"` string, `repo` is just the repo name. The CLI is responsible for constructing that combined string from its 3-segment remote URL before calling us; the server doesn't need new reshaping logic for it, since `getProvider("azure_devops").fetchRepoByFullName(token, owner, repo)` already expects exactly this shape.

## Server-Side Changes

### 1. `lib/repos/index.ts` — real bug fix, not just a feature addition

`findConnectedRepoExternalId` and `getRepoStatusForUser` currently look up by `(userId, owner, name)` with **no provider filter at all**:

```ts
// current — lib/repos/index.ts
export async function findConnectedRepoExternalId(userId, owner, name) {
  ...where(and(eq(repos.userId, userId), eq(repos.owner, owner), eq(repos.isActive, true)))
}
```

If a user ever had a GitHub repo and a GitLab repo sharing the same `(owner, name)` — plausible for a mirrored repo — this silently matches whichever row comes back first. Both functions need a `provider: GitProviderId` parameter added to their signature and `where` clause. This isn't new functionality being layered on top of a design decision; it's an existing latent correctness bug that multi-provider CLI support forces us to actually confront, since single-provider usage could never trigger it.

### 2. `app/api/cli/repos/connect/route.ts`, `disconnect/route.ts`, `status/route.ts`

All three currently import `githubProvider` directly and call its methods by name. Replace with `getProvider(parsed.data.provider)` (registry-based dispatch, same pattern the dashboard's `lib/actions/repos.ts` already uses post-Feature-20). Pass `provider` through to the now-provider-aware `findConnectedRepoExternalId`/`getRepoStatusForUser`/`connectRepoForUser`/`disconnectRepoForUser` calls.

### 3. Response shape

`connect`'s response gains a `provider` field alongside the existing `{owner, name, fullName}` — harmless to add (Zod's `z.object()` on the CLI side doesn't reject unknown extra fields unless `.strict()` is used, and the CLI's `connectRepoSchema` isn't `.strict()`), and lets a future CLI version display which provider a repo connected through without a second round-trip.

## Package Boundaries

Everything above lives in this repo (`KOINCODE-Review`) only: `lib/cli/schemas.ts`, `lib/repos/index.ts`, `app/api/cli/repos/*`. No schema/migration changes — `repos.provider` already exists from Feature 17.

## Suggested Implementation Order

1. `lib/repos/index.ts` — add `provider` param to `findConnectedRepoExternalId`/`getRepoStatusForUser` (the bug fix; verify against existing single-provider behavior first, since this must not change behavior for GitHub-only accounts).
2. `lib/cli/schemas.ts` — widen `repoRefSchema` with the optional `provider` field.
3. `app/api/cli/repos/connect/route.ts`, `disconnect/route.ts`, `status/route.ts` — swap hardcoded `githubProvider` for `getProvider(provider)`.
4. Verify against an already-installed (old-shape, no `provider` field) request still working — the whole point of the default.

## Open Questions / Deferred

- Whether to bump a CLI-visible API version header/field so the server can eventually warn old CLI installs to update — not needed for this pass (the default makes old installs keep working silently), but worth revisiting if the wire contract needs a breaking change later.
- Self-hosted GitLab/GitHub Enterprise remotes — out of scope, matching this app's existing gitlab.com-only/github.com-only scope (see `lib/providers/gitlab/client.ts`'s own comment on this).

## Status

Implemented on branch `feature/multi-provider-support`: `lib/cli/schemas.ts` (wire contract), `lib/repos/index.ts` (provider-filter bug fix), and all three `app/api/cli/repos/*` routes (registry-based dispatch, `provider` in connect's response). Verified via `pnpm tsc --noEmit` only — not yet tested against a live already-installed (no-`provider`-field) request, and not yet verified end-to-end against the CLI-side half (spec 44 in the KOINCODE repo).
