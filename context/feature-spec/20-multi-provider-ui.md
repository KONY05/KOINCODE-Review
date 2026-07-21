# Feature 20: Multi-Provider UI (Landing Page, Repos, Dashboard)

## Overview

Features 17–19 built a full `GitProvider` backend for GitHub/GitLab/Azure DevOps, but almost every user-facing surface is still hardcoded to GitHub. This spec covers what's actually left, checked against the real files (not the older, partially stale scope note in `16-extra-provider-support.md`).

## Surfaces

### 1. Landing page — provider picker (`app/page.tsx`)

Today: a single `GitHubSignInButton`. Replace with three buttons (GitHub / GitLab / Azure DevOps), each triggering `clerk.client.signIn.authenticateWithRedirect()` with the matching strategy (`oauth_github` / `oauth_gitlab` / `oauth_microsoft`). This overturns the `CLAUDE.md` line "Direct GitHub OAuth: No sign-in/sign-up pages... single login button" — `CLAUDE.md` gets updated once this ships, not before (per this project's existing convention of only updating docs after the fact).

Since GitLab/Azure DevOps also need the extra OAuth scopes (`api` / `vso.*`) that `GitProviderConnections.tsx`'s linking flow already requests via `additionalScopes`, the landing page's sign-in buttons need the same scopes on **initial** sign-in too, not just when linking a second provider later. `authenticateWithRedirect` accepts `additionalScopes` the same way `createExternalAccount` does.

A new account signing up via GitLab/Azure DevOps first means **no GitHub connection may exist at all**. Every place assuming otherwise needs to degrade gracefully:
- `getGithubToken()` call sites not already null-checked.
- The dashboard contribution widget (see Surface 4).
- Copy referencing "GitHub" specifically (`RepoList.tsx`'s heading/empty-state text, `GitProviderConnections.tsx`'s copy — already provider-neutral).

### 2. Settings — account linking

Already done (shipped alongside the Azure DevOps commit) — `GitProviderConnections.tsx` lists GitHub/GitLab/Azure DevOps uniformly via `LINKABLE_PROVIDERS`, connect state driven off `user.externalAccounts`. Nothing left here.

### 3. Repos page — connect-a-repo flow (the actual gap)

Today, 100% GitHub-hardcoded: `lib/actions/repos.ts`'s `listGithubRepos`/`connectRepo`/`disconnectRepo` always call `getGithubToken()`/`githubProvider` directly; `ReposPage` calls `listGithubRepos` directly; `RepoList.tsx`'s copy says "GitHub" throughout. This is the piece that actually blocks GitLab/Azure DevOps repos from ever being reviewable — connecting one currently has no UI path at all.

**Design:**
- Add a provider selector to the repos page (tabs or a select, next to the existing All/Connected `RepoTabs`) — populated from `user.externalAccounts` (only show providers the user has actually linked; a fresh GitHub-only account sees just "GitHub"). Persist the selected provider in the URL query (`?provider=gitlab`) so back/forward and refresh keep it, matching the existing search-param-light approach in this app.
- Generalize `lib/actions/repos.ts`: `listGithubRepos(page, perPage)` → `listProviderRepos(provider, page, perPage)`, resolving the token via `getProvider(provider).getTokenForClerkUser(clerkId)` instead of the GitHub-only `getGithubToken()`. `connectRepo`/`disconnectRepo` gain a `provider: GitProviderId` parameter, threaded through to `connectRepoForUser`/`disconnectRepoForUser` (which already take `provider` — this is a call-site change, not a `lib/repos/index.ts` change).
- `listConnectedRepos` (the "Connected" tab) already queries the DB directly rather than a provider API — just needs its `htmlUrl` construction (currently hardcodes `https://github.com/${fullName}`, a pre-existing latent bug for GitLab too, not new) fixed to branch on `repos.provider`.
- **Azure DevOps manual webhook secret.** `connectRepoForUser` already returns `manualWebhookSecret` when the auto-create path 403s (Feature 19). When `connectRepo` gets that back, surface a dialog (not a toast — the secret needs to stay visible while the user goes and pastes it elsewhere) with: a copy-to-clipboard button for the secret, and the actual Azure DevOps navigation path — **Project Settings → Service Hooks → "+" (new subscription) → Web Hooks → Next → set the URL to `{APP_URL}/api/webhooks/azure-devops`, choose "Basic authentication," username `koincode`, and paste the copied secret as the password.** (Corrected from the initially-proposed "Configuration > Settings > Webhooks" — that's not Azure DevOps's actual menu wording; "Service Hooks" is the real feature name there, distinct from "webhooks" as GitHub/GitLab call it.) The dialog shouldn't auto-dismiss on outside-click, since losing the secret means regenerating it.

### 4. Dashboard — contribution widget (`GithubActivity.tsx`)

Today: sourced entirely from GitHub's GraphQL `contributionsCollection` (`lib/providers/github/contributions.ts`) — a GitHub-only API with no equivalent we can rely on for GitLab (undocumented/inconsistent) or Azure DevOps (doesn't exist at all).

**Decision: replace it, not fork it per-provider.** Rather than trying to source three different "contribution calendar" equivalents (one of which doesn't exist), build the calendar from data we already own uniformly regardless of provider: the `reviews` table's `createdAt` timestamps. `lib/actions/reviews.ts`'s existing `fetchMonthlyReviewCounts` already proves this query shape works (groups `reviews.createdAt` by month, provider-agnostic since every review row comes from our own webhook routes, not a provider API). Add a sibling `fetchDailyReviewCounts()` grouping by day over the last year, feed it into the same `ActivityCalendar` component `GithubActivity.tsx` already uses.

This is a strict improvement, not just a workaround: it reflects actual product usage (reviews run) rather than raw commit history that was always somewhat tangential filler, and it needs zero per-provider special-casing. Rename `GithubActivity.tsx` → `ReviewActivity.tsx`, drop the `getContributions`/`getGithubToken` dependency from the dashboard page entirely. `Stats.tsx`'s `contributionStats` prop (total commits/PRs/repos-contributed-to, also GitHub-only) and `ActivityOverview.tsx`'s monthly commits/PRs chart have the same problem — both get the same treatment: replace with review-derived stats (already-completed reviews count, monthly review counts — `fetchMonthlyReviewCounts` already exists and is unused for this purpose today, only `ActivityOverview`'s `monthlyReviews` prop uses it; `monthlyActivity` from GitHub contributions is the one being dropped).

## Not in scope here

- Bitbucket or any other provider — out of scope per `16-extra-provider-support.md`.
- Azure DevOps's actual `vso.hooks_write` grantability — still unverified live (Feature 19 gap), this spec's manual-secret dialog is what makes that gap tolerable rather than blocking.
- Multi-line suggestion syntax differences — resolved separately (GitLab's `:-N+M` offset, shipped alongside Feature 19's commit).

## Implementation Order

1. `lib/actions/repos.ts` + `ReposPage` + `RepoList.tsx` — provider-aware repo listing/connect/disconnect, including the Azure DevOps manual-secret dialog.
2. Dashboard — swap `GithubActivity`/`Stats`/`ActivityOverview` to review-derived data.
3. Landing page — provider-picker buttons.
4. `CLAUDE.md` update (after the above ships, per this project's existing convention).
