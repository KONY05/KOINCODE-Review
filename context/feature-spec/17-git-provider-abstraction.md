# Feature 17: Git Provider Abstraction

## Overview

Pure refactor, zero user-visible behavior change: introduces a `GitProvider` interface that `lib/github/` (now `lib/providers/github/`) implements, so GitLab (Feature 18) and Azure DevOps (Feature 19) can plug in later without touching the review pipeline, webhook handling, or CLI routes again. First step of the initiative described in `context/feature-spec/16-extra-provider-support.md`.

## Why

`lib/ai/` already proved this pattern for LLM providers — one interface, swappable implementations, zero branching in the callers. Git hosting needed the same treatment before a second provider's code existed to copy-paste-diverge from. Doing it now, while there's exactly one real implementation to migrate, is far cheaper than untangling GitHub-specific assumptions (numeric ids, Octokit types leaking into call sites) after a second provider is already half-written against them.

## Schema Change

`repos` table, migrated in two steps (`drizzle/0008_provider-abstraction-step1.sql`, `0009_provider-abstraction-step2.sql`) rather than one, because `drizzle-kit generate` needs an interactive TTY to disambiguate a same-diff column rename from a drop+add — unavailable in this environment. Splitting into an additive step (new nullable `external_id` column + `provider` enum + `webhook_id` type change) followed by a backfill and a tightening step (drop `github_id`, `external_id` → `NOT NULL`, fix the unique constraint) avoided that prompt entirely and kept the single live repo row (and its 24 review rows, which cascade-delete with their repo) intact — verified before and after each step against the dev Neon DB.

- `github_id integer` → `external_id text`: GitHub's numeric id, GitLab's numeric project id, and Azure DevOps's GUID repository id all fit in `text`; only GitHub needed `integer`.
- `webhook_id integer` → `webhook_id text`: same reasoning (Azure DevOps service hook ids are GUIDs).
- New `provider` column, backed by a `git_provider` Postgres enum currently containing only `"github"` — Feature 18/19 each add their own value via `ALTER TYPE ... ADD VALUE` when they land, rather than declaring `"gitlab"`/`"azure_devops"` speculatively now.
- Unique constraint moved from `(user_id, github_id)` to `(user_id, provider, external_id)` — two providers could otherwise coincidentally reuse the same native id space.

## The `GitProvider` Interface

`lib/providers/types.ts` defines the interface and its supporting types (`RemoteRepo`, `PRFile`, `DraftReviewComment`, `PostedComment`, `ReviewSummary`, `CommitStatusParams`, `RepoFile`, `FileChanges`). Method surface mirrors the old `lib/github/*` exports almost 1:1 (`fetchPRFiles`, `fetchPRDiff`, `fetchPRHeadSha`, `postReviewComments`, `replyToComment`, `createCommitStatus`, `fetchPushChanges`, `createRepoWebhook`/`deleteRepoWebhook`, `fetchRepoTree`, `fetchFileContent`/`fetchChangedFileContents`, `listUserRepos`/`fetchRepoByFullName`, `getTokenForClerkUser`) — the goal was moving code behind a seam, not redesigning the surface.

**Deliberately excluded from the interface:**
- **`getGithubToken()`** (session-scoped, no `clerkId` arg) — Clerk-session convenience, not something that generalizes; stays a directly-imported GitHub-only export.
- **GitHub's contribution graph** (`getContributions` and its types) — a GitHub-culture-specific dashboard feature with no obvious GitLab/Azure DevOps equivalent; moved into `lib/providers/github/contributions.ts` as a bonus export, not interface surface.
- **`mapDiffLineToPosition`** — GitHub's specific diff-position encoding for its review-comment API; stays internal to `lib/providers/github/comments.ts`. Other providers will need their own position-mapping logic when they're built, not a shared abstraction guessed at now.
- **`detectAdoptions`** — pure function, no I/O, already provider-agnostic; moved to `lib/providers/adoption.ts` (shared, not per-provider) rather than duplicated per implementation.
- **Webhook signature verification** — `app/api/webhooks/github/route.ts` still does its own inline HMAC check; Features 18/19 will add their own `/api/webhooks/gitlab` and `/api/webhooks/azure-devops` routes with their own verification, each provider's scheme being different enough that guessing a shared shape now would be speculative.

## Naming Decision Deferred: `githubCommentId`

`reviews.comments` (jsonb, typed via `ReviewComment` in `lib/db/schema/reviews.ts`) keeps its `githubCommentId?: number` field name and type as-is — **not** renamed to something generic. The `GitProvider` interface's own `PostedComment.providerCommentId: string` is generic, but the one call site that writes into the DB (`lib/inngest/functions.ts`, `save-review` step) does the conversion at that single boundary: `Number(posted.providerCommentId)`. Renaming the DB-stored field would also touch the webhook route's reply-matching (`c.githubCommentId === parentCommentId`) and any future UI linking to it — out of scope for a zero-behavior-change refactor. Feature 18 will make the real naming call once GitLab's comment-id shape is known.

## Where Provider Dispatch Actually Lives (and Where It Doesn't)

- **`lib/repos/index.ts`** (`connectRepoForUser`/`disconnectRepoForUser`) — genuinely dispatches via `getProvider(provider).createRepoWebhook(...)`/`.deleteRepoWebhook(...)`. This is the shared connect/disconnect tail already used by both the dashboard and the CLI, so wiring it through the registry now means Feature 18/19 won't need to touch this file at all — just register a new provider.
- **`lib/inngest/functions.ts`** (the actual review pipeline: `processReview`, `indexRepo`, `trackAdoption`, etc.) — **not** rewired to dispatch dynamically. Every call still goes directly to the `lib/providers/github/*` functions, and every token lookup is still a hardcoded `clerkClient().users.getUserOauthAccessToken(..., "github")`. This is intentional, not an oversight: per the project's own "don't add abstractions until there are ≥2 concrete consumers" rule, the pipeline's dynamic provider-selection logic is real work that depends on knowing what GitLab/Azure DevOps actually need (different token retrieval, different diff formats) — that's Feature 18's job, done with a second consumer in hand instead of guessed at now.
- **`lib/actions/repos.ts`** (`listGithubRepos`, dashboard's live GitHub repo listing) — still hardcoded to GitHub. No UI exists yet to pick a provider; that's Feature 20 (dashboard/repo UI updates).
- **`app/api/webhooks/github/route.ts`** — still GitHub-only end to end (its own route path, its own payload types, its own signature check), now querying `repos` by `(provider = "github", external_id)` instead of `github_id`.

## Files Created

| File | Purpose |
|---|---|
| `lib/providers/types.ts` | `GitProvider` interface + shared types |
| `lib/providers/adoption.ts` | Shared pure `detectAdoptions` (provider-agnostic) |
| `lib/providers/registry.ts` | `getProvider(id)` — currently resolves only `"github"` |
| `lib/providers/github/{auth,repos,webhooks,diff,files,checks,tree,comments,adoption,contributions}.ts` | GitHub implementation, moved from `lib/github/*` with type/field renames (`GitHubRepo` → `RemoteRepo`, numeric ids → `string`) |
| `lib/providers/github/index.ts` | Assembles `githubProvider: GitProvider`; re-exports `getGithubToken` and contributions as GitHub-only bonus surface |

## Files Deleted

`lib/github/` (all 10 files) — fully replaced by `lib/providers/github/` and `lib/providers/*`.

## Files Modified

| File | Change |
|---|---|
| `lib/db/schema/repos.ts` | `provider` enum, `github_id`/`webhook_id` → `external_id`/`webhook_id` (text), unique constraint on `(user_id, provider, external_id)` |
| `lib/repos/index.ts` | `connectRepoForUser`/`disconnectRepoForUser` take an explicit `provider` param, dispatch webhook create/delete via `getProvider()`; `findConnectedRepoGithubId` renamed `findConnectedRepoExternalId` |
| `lib/actions/repos.ts` | `GitHubRepo` → `RemoteRepo`, `githubId` → `externalId`, imports from `lib/providers/github` |
| `app/api/webhooks/github/route.ts` | Repo lookups filter on `(provider = "github", externalId)` instead of `githubId` |
| `lib/inngest/functions.ts` | Import paths only, plus the `providerCommentId` → `githubCommentId` conversion at the DB-write boundary |
| `app/api/cli/repos/{connect,disconnect}/route.ts` | Use `githubProvider` directly; disconnect route renamed `githubId` → `externalId` throughout |
| `app/(dashboard)/dashboard/page.tsx`, `components/Dashboard/{Stats,GithubActivity,ActivityOverview}.tsx` | Import path updates only |
| `components/Repository/{RepoList,RepositoryItem}.tsx` | `repo.githubId` → `repo.externalId` |
| `lib/vector/indexing.ts` | `RepoFile` type now imported from `lib/providers/types` |

## Verification

`pnpm tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass clean. Migration applied against the live Neon dev DB with the pre-existing repo row and its 24 review rows confirmed intact afterward (`external_id` correctly backfilled from `github_id`). The device-auth/CLI-side and GitLab/Azure DevOps paths obviously aren't exercised yet — there's only one provider implemented.
