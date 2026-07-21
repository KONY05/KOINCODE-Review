# Feature 19: Azure DevOps Integration

## Overview

Research + design spec for adding Azure DevOps as a third `GitProvider`. Unlike Feature 18 (GitLab), the auth model, webhook feasibility, and even the basic owner/repo addressing scheme all needed real research before committing to an implementation — this document captures that research and the resulting design decisions. Implementation follows in a subsequent pass once these are confirmed.

## Auth: Confirmed Findings

- **No separate "Azure DevOps" OAuth strategy exists.** Auth goes through Clerk's existing **Microsoft** social provider (`oauth_microsoft`, `getUserOauthAccessToken(clerkId, "microsoft")`) — Azure DevOps API access is just one more permission scope on a Microsoft Entra ID token, not a distinct identity provider.
- **A custom Entra ID app registration is required**, same "Use custom credentials" pattern as GitLab's Feature 18 setup — Clerk's shared/default Microsoft app has no reason to have the Azure DevOps API permission configured, since that requires explicitly adding "Azure DevOps" (resource app ID `499b84ac-1321-427f-aa17-267ca6975798`) as an API permission on the specific app registration in Entra.
- **Scope model is far more granular than GitHub's `repo` or GitLab's `api`.** Full catalog fetched from Microsoft's own docs (`vso.*` scopes). What our `GitProvider` interface needs, mapped:
  - `vso.project` — list projects (organization → project is the first level of the hierarchy, see below)
  - `vso.code_full` — repo listing, tree/file reads, PR diffs/iterations, creating/managing PRs
  - `vso.code_status` — commit + PR statuses (**not** inherited by `vso.code_full` — it's a sibling scope, easy to miss)
  - `vso.threads_full` — PR comment threads (also **not** inherited by the code scope chain — its own standalone scope)
  - `vso.hooks_write` — creating/deleting service hook (webhook) subscriptions

## Correction (found via live testing, post-implementation): Scope Format Was Wrong

The `vso.*` scope names listed above turned out to be the wrong format for the OAuth path this integration actually uses, discovered when live testing produced a "token not found" error despite a fresh, successful-looking account link. Two different Azure DevOps auth systems exist:

- **Azure DevOps's own legacy OAuth** (`app.vssps.visualstudio.com/oauth2/authorize`) — accepts bare scope strings like `vso.project`/`vso.code_full`. This is what the scope names above were sourced from.
- **Microsoft Entra ID's v2 identity platform** (`login.microsoftonline.com/.../oauth2/v2.0/authorize`) — what Clerk's "Microsoft" connection actually authenticates through. Custom API scopes here must be fully qualified with the resource's Application ID URI; bare `vso.*` names aren't recognized and get silently dropped rather than erroring, so authorization proceeds but only grants a Microsoft Graph-audience token — no Azure DevOps-audience token is ever issued, which is exactly why token retrieval came back empty.

**Fix**: request the single fully-qualified scope `499b84ac-1321-427f-aa17-267ca6975798/user_impersonation` instead of the granular `vso.*` list (both in Clerk's dashboard Scopes field and `additionalScopes` in code) — `user_impersonation` is the one delegated permission the "Azure DevOps" API actually exposes on an Entra app registration anyway (see below), consistent with the Entra Portal only ever showing that single checkbox rather than a granular scope picker. Also add `offline_access`, required for Microsoft's identity platform to issue a refresh token at all — without it the short-lived (~60-90 min) access token has no way to renew once it expires.

## Correction #2: The Real Blocker Was Admin Consent, Plus a Real Detection Bug

Fixing the scope format above still didn't resolve it — `getUserOauthAccessToken` came back with **zero entries**, not a wrong-scope one. Checked Clerk's raw external-account record directly (Clerk Dashboard → Users → this user → the record's `verification` sub-object): `status: "expired"`, `code: "oauth_access_denied"`, `"You did not grant access to your Microsoft account"`, with every actual identity field (`provider_user_id`, `approved_scopes`, `email_address`) empty.

**Root cause**: the Azure DevOps API permission requires Entra admin consent (most non-Microsoft-Graph API permissions do, by default), and it was never explicitly granted via the "Grant admin consent for [tenant]" button on the app registration's API permissions blade — Microsoft rejects the entire authorization with `access_denied` rather than proceeding with a reduced scope set.

**Real bug this exposed**: `listLinkedProviders()` (`lib/actions/repos.ts`) and `GitProviderConnections.tsx`'s connected-state check both treated *any* `externalAccounts` entry as "connected," without checking `verification.status`. Clerk creates the external-account row as soon as an OAuth flow *starts*, before it's known to succeed — so a denied authorization like this one looked identical to a real, working connection in both the repos page's provider selector and the Settings page's "connected" badge, despite there being no usable token behind it at all. Fixed by requiring `verification?.status === "verified"` in both places.

## The Blocker: Service Hook Scope May Not Be Grantable

Microsoft's own scope reference table marks `vso.hooks`, `vso.hooks_write`, and `vso.hooks_interact` **"(No longer public.)"** — genuinely unclear whether a newly-registered (2026) app can be granted delegated permission to manage service hook subscriptions at all. This isn't discoverable without actually registering an app and testing it.

**Resolved via live testing.** The scope itself turned out not to be the limiting factor at all — the `user_impersonation` grant (see the correction above) is broad enough to attempt the call. What actually blocks it is the identity's own **Azure DevOps organization-level permission**: creating/managing service hook subscriptions requires "Edit subscription" rights, which are effectively Project Collection Administrator-level — well above the "Basic" access level a normal added org member gets. A test account added as a regular member hit this immediately.

**Real bug this exposed**: Azure DevOps doesn't return 403 for this — it returns **400**, an `ArgumentException` with a plain-English message ("The user '...' does not have permission to edit a subscription."). `createRepoWebhook`'s fallback-to-manual logic only checked for a literal 403, so this specific, apparently-common case wasn't caught at all and instead broke the whole `connectRepoForUser` transaction with an unhandled error. Fixed with an `isPermissionDenied()` check that also matches a 400 whose message contains "does not have permission" (`lib/providers/azure-devops/webhooks.ts`). Given how easily a normal org member hits this, the manual-setup fallback path is likely to be the *common* case for Azure DevOps repos, not a rare edge case — worth keeping in mind for how prominently Feature 20's connect-repo UI surfaces it.

**Decision — hybrid, not manual-only:** don't gate the whole feature on this being resolved in advance, and don't design for manual-only either (that regresses every user's experience for a risk that may not materialize). Instead:
1. Request `vso.hooks_write` during account linking regardless (costs nothing to ask for).
2. On repo connect, attempt to auto-create the service hook subscription via the API exactly like GitHub/GitLab's `createRepoWebhook`.
3. If that specific call 403s (the only way to actually know whether the scope was honored — Entra doesn't signal a silent scope downgrade at consent time), catch it and fall back to a manual setup flow: show the user the webhook URL and a secret to paste into Azure DevOps's Service Hooks UI themselves.

This means `lib/providers/azure-devops/webhooks.ts`'s `createRepoWebhook` needs a different contract than GitHub's/GitLab's — it can return either a created webhook id *or* a "manual setup required" result, rather than always succeeding or throwing. Feature 20 (which owns the actual connect-repo UI) needs to design for that second outcome, not just a single "connected" state.

**Per-repo secret, not one shared global secret.** GitHub/GitLab's webhook secret (`GITHUB_WEBHOOK_SECRET`/`GITLAB_WEBHOOK_SECRET`) is a single platform-wide value because *we* create the webhook programmatically every time — the secret never leaves our server. The manual-fallback path is different: the user themselves pastes a secret into Azure DevOps's Basic Auth fields, meaning it's shown to them in our UI. A single shared secret shown to every user who ever hits the manual path would let any of them forge a webhook payload claiming to be any other repo (the `findActiveRepo` lookup validates *that a repo exists* for the claimed provider+externalId, not that the secret was scoped to that specific repo). So the manual path needs a **per-repo generated secret**, stored on the `repos` row — a real, if small, schema addition (nullable `webhookSecret` column, populated only when the manual path is actually taken).

## Architecture Mismatch: Three-Level Hierarchy

GitHub and GitLab both address a repo as `owner/repo` (organization or user, then repo name) — that's baked into `repos.owner`/`repos.fullName` and, more importantly, into shared pipeline code: `lib/inngest/functions.ts` and both existing webhook routes do `const [owner, repoName] = repoFullName.split("/")` in multiple places, hard-assuming exactly two segments.

Azure DevOps has **organization → project → repository** — three levels, not two. A `repoFullName` of `myorg/myproject/myrepo` would silently mis-parse through that exact split today (`owner` would become `"myorg"`, `repoName` would become `"myproject"`, and the actual repo name would be dropped).

**Decision:** keep the `GitProvider` interface's `(token, owner, repo, ...)` shape unchanged (no interface redesign for a third provider this late), but encode Azure DevOps's `owner` argument as the combined `"organization/project"` string — so `repos.fullName` becomes `organization/project/repo` (3 segments) and `repos.owner` becomes `organization/project` (contains a `/`, unlike GitHub/GitLab's single-segment owner). `lib/providers/azure-devops/*` re-splits that combined owner string internally wherever the Azure DevOps REST API needs organization and project as separate URL path segments (which is everywhere — Azure DevOps URLs are `dev.azure.com/{org}/{project}/_apis/...`).

This means every `repoFullName.split("/")` call site in the *already-shared* pipeline code needs to become provider-aware before Azure DevOps repos can flow through it correctly — this is real, necessary rework of `lib/inngest/functions.ts` and the webhook routes, not just new Azure DevOps files. Likely shape: a small shared `splitRepoFullName(provider, fullName): { owner, repo }` helper in `lib/providers/` that knows GitHub/GitLab split on the *last* `/` while Azure DevOps... actually needs the *first* two segments joined vs. the last segment split off (`org/project/repo` → owner = `org/project`, repo = last segment) — splitting on the **last** `/` works uniformly for all three providers, actually (GitHub/GitLab: `owner/repo` → last `/` splits correctly; Azure DevOps: `org/project/repo` → last `/` still correctly isolates `repo`, leaving `org/project` as `owner` intact). So the fix is narrower than it first looks: replace `repoFullName.split("/")` (splits on *every* `/`, producing 3 array elements for Azure DevOps) with a split on the *last* `/` only, which produces the correct 2-way split for all three providers without needing per-provider branching at all.

## API Endpoint Mapping

| `GitProvider` method | Azure DevOps endpoint |
|---|---|
| `getTokenForClerkUser` | Clerk `getUserOauthAccessToken(clerkId, "microsoft")` |
| `listUserRepos` | `GET /_apis/projects` (list projects) then `GET /{org}/{project}/_apis/git/repositories` per project — no single flat "list all my repos" call exists the way GitHub's `listForAuthenticatedUser` does |
| `fetchRepoByFullName` | `GET /{org}/{project}/_apis/git/repositories/{repo}` |
| `createRepoWebhook`/`deleteRepoWebhook` | `POST`/`DELETE /{org}/_apis/hooks/subscriptions` (org-level, not project- or repo-scoped — see hybrid design above) |
| `fetchRepoTree` | `GET /{org}/{project}/_apis/git/repositories/{repo}/items?recursionLevel=Full` |
| `fetchFileContent` | `GET /{org}/{project}/_apis/git/repositories/{repo}/items?path=...&version=...&includeContent=true` |
| `fetchPRFiles` | `GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}/iterations/{iterationId}/changes` |
| `fetchPRDiff` | `POST /{org}/{project}/_apis/git/repositories/{repo}/diffs/files` (base/target commit diff) |
| `fetchPRHeadSha` | Pull Request object's `lastMergeSourceCommit.commitId` |
| `postReviewComments`/`replyToComment` | `POST /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}/threads` (create thread with `threadContext` for file/line position) / `.../threads/{threadId}/comments` (reply) |
| `createCommitStatus` | `POST /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}/statuses` (PR-scoped) or `.../commits/{commitId}/statuses` (commit-scoped) |
| `fetchPushChanges` | Same iteration-changes endpoint as `fetchPRFiles`, called with before/after commit ids |

## Schema Changes Needed

- `git_provider` enum: add `"azure_devops"`.
- `repos.webhookSecret` (new, nullable `text`): per-repo secret for the manual webhook-setup fallback only; `null` for repos whose webhook was auto-created (GitHub, GitLab, and Azure DevOps repos where `vso.hooks_write` worked).

## Env Vars

- No new required var for the OAuth side (credentials live in Clerk's dashboard, same as GitLab).
- No new webhook-verification env var either, unlike GitHub/GitLab — Azure DevOps's webhook secret is per-repo (see above), not a single platform-wide value.

## Explicitly Not Resolved by This Document

- Whether `vso.hooks_write` actually works — only discoverable by registering the Entra app and testing against a real Azure DevOps org/project.
- The manual-webhook-setup UI itself (where the user pastes the secret, how we detect they've completed it) — that's Feature 20 territory, same as GitLab's repo-connect UI.
- Whether Azure DevOps's PR thread creation supports the same `\`\`\`suggestion` fenced-block one-click-apply syntax GitHub/GitLab share — untested; if not, `formatCommentBody`'s shared logic needs an Azure-DevOps-specific override rather than being universally shared.

## Recommendation Before Writing Code

Given the number of real unknowns stacked here (hooks scope, hierarchy-mismatch fix touching already-shared pipeline code, per-repo secret schema addition, untested suggestion-syntax support) — more than GitLab had — this seems like the right point to confirm the plan before a large implementation pass, rather than building all of it and finding out one of these assumptions was wrong partway through.
