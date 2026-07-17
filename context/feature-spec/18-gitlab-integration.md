# Feature 18: GitLab Integration

## Overview

Adds GitLab as a second `GitProvider` implementation (`lib/providers/gitlab/*`), a GitLab webhook route, and account-linking UI ("Connect GitLab" in Settings > Connections). Second part of the initiative in `context/feature-spec/16-extra-provider-support.md`, following Feature 17's abstraction refactor.

**What this feature does NOT do:** there is still no way to actually connect a GitLab *repo* through the dashboard — no repo-listing UI, no "Connect" button on a GitLab project. That's Feature 20 ("Dashboard & repo UI updates"), scoped out deliberately per the Feature 16 overview. Feature 18 makes the backend and the account-linking step ready for it. The CLI (`/api/cli/repos/*`) also stays GitHub-only — same reasoning.

## GitLab API Research Findings

- **Auth**: GitLab OAuth access tokens are used as `Authorization: Bearer <token>` against `https://gitlab.com/api/v4` — no gotchas here, same shape as GitHub. Clerk's `getUserOauthAccessToken(clerkId, "gitlab")` mirrors the existing `"github"` call exactly.
- **Webhooks**: GitLab's classic webhook auth is a **static secret token** sent verbatim in the `X-Gitlab-Token` header — not an HMAC signature over the body like GitHub's `X-Hub-Signature-256`. Still compared via `crypto.timingSafeEqual` to avoid a timing side-channel, but there's nothing to sign/verify against the payload itself.
- **Diffs**: `GET /projects/:id/merge_requests/:iid/diffs` returns each changed file's `diff` text *without* the `diff --git`/`---`/`+++` header lines GitHub's patches include (`old_path`/`new_path` are separate JSON fields instead) — synthesized in `lib/providers/gitlab/diff.ts`'s `toUnifiedDiffBlock` for `fetchPRDiff`'s concatenated output. No `additions`/`deletions` counts are returned either — counted from the patch text directly.
- **Inline comments (Discussions API)**: `POST /projects/:id/merge_requests/:iid/discussions` needs the MR's `diff_refs` (`base_sha`/`start_sha`/`head_sha`), fetched fresh right before posting rather than trusting the pipeline's already-resolved `headSha` — GitLab requires all three SHAs to come from the same consistent read or the position is silently discarded (confirmed via research: GitLab responds `201 Created` either way, downgrading to a plain unpositioned note — `lib/providers/gitlab/comments.ts` checks `notes[0].type !== "DiffNote"` and logs a warning rather than assuming success). Unlike GitHub (which computes an artificial "diff position" by walking the patch), GitLab just wants the real line number directly (`position[new_line]`) — no equivalent of `mapDiffLineToPosition` is needed.
- **Commit status**: `POST /projects/:id/statuses/:sha` uses a different vocabulary than GitHub's — `failed` instead of `failure`, no `error` state (folded into `failed`), an extra `running` state never emitted here, and the query param is `name` not `context`.
- **Replies live in "discussions," not individual comments**: a GitLab reply needs the *discussion id* (the thread), not an individual note id — so `PostedComment.providerCommentId` stores the discussion id for GitLab (vs. GitHub's individual comment id), and `replyToComment`'s `inReplyTo` param is that discussion id either way. This is exactly why `reviews.comments[].githubCommentId: number` got renamed to `providerCommentId: string` in this feature (see below) — GitHub's field name/type couldn't represent GitLab's string discussion-id hashes.

## Known Limitations (documented, not fixed here)

- **gitlab.com only.** Self-hosted GitLab instances would need a per-repo base URL stored somewhere — not requested scope.
- **Single-line comment positioning only.** GitLab's multi-line comments need a `position[line_range]` with `line_code`s — GitHub's `DraftReviewComment.startLine` is accepted by the interface but ignored by the GitLab implementation; every comment anchors on `comment.line` only.
- **Renamed files may mis-position.** `old_path`/`new_path` are both set to `comment.path` (the interface's `patches: Map<string, string>` doesn't carry a separate old path) — fine for the common non-renamed case, silently downgrades to an unpositioned note otherwise (per the `DiffNote` check above).
- **No primary language on GitLab repos.** `RemoteRepo.language` is always `null` for GitLab — the project list API doesn't include it without an extra per-project call.
- **Reply-detection is a heuristic, not exact.** GitLab's Notes API has no equivalent of GitHub's `in_reply_to_id` — every note in a discussion thread shares the same `discussion_id`, including the one KOINCODE itself just posted (and GitLab's `note_events` webhook fires for API-created notes too). `app/api/webhooks/gitlab/route.ts`'s `handleNote` guards against processing our own post as a "reply" by skipping notes that are byte-identical to the stored comment body. Not watertight, and **not yet exercised against a live GitLab webhook** — flagged as the first thing to verify once GitLab is actually enabled.

## Schema

`drizzle/0010_add-gitlab-provider.sql`: `ALTER TYPE "git_provider" ADD VALUE 'gitlab'` — safe, additive, no data migration needed (unlike Feature 17's column changes).

## Shared Utilities Extracted (now genuinely justified by a 2nd consumer)

Per the project's "don't abstract until there are ≥2 consumers" rule — these were GitHub-only in Feature 17 specifically because there was only one consumer; GitLab is the second, so pulling them out now is the rule being followed, not broken:

- `lib/providers/diff-utils.ts`: `parseHunkRanges` (unified diff hunk-header parsing) and `shouldSkipFile` (lockfiles/minified/images) — both operate on plain-`git diff` conventions common to every provider.
- `lib/providers/tree-classify.ts`: `classifyFile` (README/config detection for initial repo indexing).
- `lib/providers/review-body.ts`: `buildReviewBody` and `formatCommentBody` — pure markdown construction. GitLab supports the identical ` ```suggestion ` fenced-block syntax GitHub does, so the one-click "Apply suggestion" rendering is byte-for-byte shared, not reimplemented.

## The `providerCommentId` Rename

`lib/db/schema/reviews.ts`'s `ReviewComment.githubCommentId?: number` is now `providerCommentId?: string` — the naming call Feature 17's spec explicitly deferred until a second provider's actual comment-id shape was known. GitLab's discussion ids are string hashes, not numbers, so the old field couldn't represent them. Updated at all three call sites: the DB type itself, `lib/inngest/functions.ts`'s `save-review` step (now a direct pass-through, no more `Number()` conversion), and `app/api/webhooks/github/route.ts`'s reply-matching (`String(payload.comment.in_reply_to_id)` compared against the stored string). This is a pure TypeScript-level rename — `reviews.comments` is a jsonb column, so no SQL migration was needed; historical rows with the old field name are simply orphaned from reply-matching going forward (acceptable, dev-stage data).

## Review Pipeline Now Actually Provider-Aware

Feature 17 deliberately left `lib/inngest/functions.ts` hardcoded to GitHub — correct at the time, since GitLab didn't exist yet to prove out what dynamic dispatch actually needed. That's what this feature does: every function that touches a repo (`indexRepo`, `cancelReview`, `processReview`, `indexChangedFilesJob`, `trackAdoption`, `processCommentReply`) now resolves the repo's `provider` column fresh (`getRepoGitProvider(repoId)`) and calls `getProvider(gitProvider).<method>(...)` instead of importing GitHub functions directly. Every hardcoded `getUserOauthAccessToken(clerkId, "github")` became `getProvider(gitProvider).getTokenForClerkUser(clerkId)`. One event shape fix was needed along the way: `pr/review-cancelled` didn't carry `repoId` (only `repoFullName`), so there was no way to resolve which provider a cancelled review's repo used — added to both the GitHub and (new) GitLab webhook routes' dispatch and to `cancelReview`'s consumption.

Also renamed the `repo/connected` event's `githubToken` field to `token` (dispatched from `lib/repos/index.ts`'s `connectRepoForUser`, which already took a generic `provider` param since Feature 17).

## Webhook Route: What's Shared vs. Provider-Specific

`lib/webhooks/repo-lookup.ts` (new) holds only the pieces that are mechanically identical regardless of payload shape: `findActiveRepo(provider, externalId)`, `cancelInFlightReviews(repoId, prNumber, summary)`, `findParentReviewComment(repoId, providerCommentId)`. `app/api/webhooks/github/route.ts` was refactored to use these instead of its own inline copies. Everything else — payload parsing, signature/token verification, exact event dispatch shape, analytics properties — stays duplicated per route (`app/api/webhooks/github/route.ts` vs. the new `app/api/webhooks/gitlab/route.ts`) rather than forced into one shared orchestration function. GitLab's merge-request lifecycle doesn't map 1:1 onto GitHub's PR actions (e.g. `action: "update"` covers title/description edits *and* new pushes — distinguished only by whether `oldrev` is present), so trying to unify the two into a single generic handler risked hiding that mismatch rather than being simpler.

## Settings: "Connect GitLab" Account Linking

`components/Settings/connections/GitProviderConnections.tsx` (new, client component) added to the existing `/settings/connections` page above the CLI-connections table. Lists both GitHub and GitLab the same way — a "Connect X" button, or a connected badge, driven by checking Clerk's `useUser().user.externalAccounts` directly (no server round-trip needed — Clerk already has this client-side); no disconnect offered for either, matching the "don't let someone lock themselves out" default. GitHub happens to always show as connected *today* only because the landing page's single sign-in button makes that unconditionally true for every existing account — it is **not** hardcoded, specifically so this keeps working correctly once Feature 20 adds a multi-provider sign-in picker and an account could exist with GitLab as its primary connection and no GitHub link at all (an earlier draft of this component did hardcode GitHub as a permanently-connected row; caught in review and generalized before shipping). Uses `user.createExternalAccount({ strategy: "oauth_github" | "oauth_gitlab", redirectUrl: "/sso-callback?intent=link" })`, then navigates to `externalAccount.verification.externalVerificationRedirectURL.href` per Clerk's documented account-linking pattern.

Reuses the existing `/sso-callback` route (`AuthenticateWithRedirectCallback` handles completing any pending Clerk OAuth flow, not just sign-in) rather than building a second callback page. One side effect fixed: that route's `SignInTracker` unconditionally fired a `USER_SIGNED_IN` analytics event on every visit — now skipped when `?intent=link` is present, so linking a second provider doesn't get miscounted as a new sign-in. `useSearchParams()` in a client component requires a Suspense boundary in the App Router — added around `<SignInTracker />` in `app/sso-callback/page.tsx`.

**External prerequisite, not doable from code**: a GitLab OAuth application needs to be registered and GitLab enabled as a social connection in the Clerk dashboard before any of this can be exercised live. Same situation as Feature 14's device-auth flow shipping without live CLI-side testing.

## Files Created

| File | Purpose |
|---|---|
| `lib/providers/diff-utils.ts` | Shared `parseHunkRanges`, `shouldSkipFile` |
| `lib/providers/tree-classify.ts` | Shared `classifyFile` |
| `lib/providers/review-body.ts` | Shared `buildReviewBody`, `formatCommentBody` |
| `lib/providers/gitlab/{client,auth,repos,webhooks,tree,files,diff,comments,checks,adoption,index}.ts` | GitLab `GitProvider` implementation |
| `lib/webhooks/repo-lookup.ts` | Shared repo/review lookups used by both webhook routes |
| `app/api/webhooks/gitlab/route.ts` | GitLab webhook handler (merge_request, note events) |
| `components/Settings/connections/GitProviderConnections.tsx` | "Connect GitLab" account-linking UI |
| `drizzle/0010_add-gitlab-provider.sql` | Adds `'gitlab'` to the `git_provider` enum |

## Files Modified

| File | Change |
|---|---|
| `lib/providers/types.ts` | `GitProviderId` now `"github" \| "gitlab"` |
| `lib/providers/registry.ts` | Registers `gitlabProvider` |
| `lib/providers/github/{adoption,tree,diff,comments}.ts` | Now import the shared utilities instead of their own copies |
| `lib/db/schema/repos.ts` | `gitProviderEnum` includes `"gitlab"` |
| `lib/db/schema/reviews.ts` | `githubCommentId?: number` → `providerCommentId?: string` |
| `lib/inngest/functions.ts` | Every function resolves `gitProvider` per-repo and dispatches via `getProvider()`; `repo/connected`'s `githubToken` field renamed `token` |
| `lib/repos/index.ts` | `connectRepoForUser`'s dispatched event field renamed to match |
| `app/api/webhooks/github/route.ts` | Uses `lib/webhooks/repo-lookup.ts`; `pr/review-cancelled` now includes `repoId`; reply-matching uses `providerCommentId` |
| `app/(dashboard)/settings/connections/page.tsx` | Renders `GitProviderConnections` |
| `app/sso-callback/{page,sign-in-tracker}.tsx` | `?intent=link` skips the sign-in analytics event; Suspense boundary added |
| `config/env.ts`, `CLAUDE.md` | New optional `GITLAB_WEBHOOK_SECRET` |
| `lib/db/schema/repos.ts` | New index `repos_provider_external_id_idx` on `(provider, external_id)` |

## Post-Review Fix: Missing Index on the Webhook Lookup Path

`lib/webhooks/repo-lookup.ts`'s `findActiveRepo(provider, externalId)` — called on *every* incoming webhook delivery from either provider — filters by `(provider, external_id, is_active)` with no `user_id` in scope. The only index touching those columns was the `(user_id, provider, external_id)` unique constraint from Feature 17, which Postgres can't use efficiently here since `user_id` is its leading column and isn't part of this query. `EXPLAIN` confirmed a sequential scan. Added a dedicated `repos_provider_external_id_idx` on `(provider, external_id)` (migration `0011_add-repos-provider-external-id-index.sql`) and verified it exists via `pg_indexes`. With only one row in the dev table Postgres still plans a seq scan (correctly — an index scan isn't worth it at this size), but the index is in place for when the table grows.

## Verification

`pnpm tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass clean (`/api/webhooks/gitlab` appears in the build's route list). Nothing here has been exercised against a real GitLab instance — that needs the Clerk-dashboard/OAuth-app prerequisite above. The reply-detection heuristic in particular should be the first thing checked once that's possible.
