# Feature 16: Multi Git-Provider Support (Initiative Overview)

## Overview

Today KOINCODE-Review is GitHub-only end to end: Clerk auth is a direct GitHub OAuth button, `lib/github/` owns every webhook/diff/comment/commit operation via Octokit, and the DB/webhook layer assume GitHub payload shapes throughout. User research surfaced that a meaningful slice of companies don't use GitHub at all — Azure DevOps and GitLab came up repeatedly. This is a multi-feature initiative, not a single feature: it touches auth, webhooks, the review pipeline, the dashboard UI, and the CLI integration, so it's split into sequential sub-features below rather than one PR.

## Why

BYOK already proved the pattern: `lib/ai/` abstracts LLM providers behind a common interface so adding a new one doesn't touch the review pipeline. Git hosting should work the same way. Locking in GitHub-only assumptions now (hardcoded Octokit calls, GitHub-shaped webhook parsing) would mean a painful untangling later; doing the abstraction now — before a second provider's code exists to copy-paste-diverge from — is cheaper.

## Target Providers (this pass)

- **GitLab** — chosen alongside Azure DevOps as the two most common non-GitHub setups reported in research. Bitbucket stays out of scope for now (no signal from research).
- **Azure DevOps** — the specific provider that prompted this research.

## Auth Research Findings

- **GitLab**: Clerk supports GitLab as a first-class social OAuth provider (same integration shape as the existing GitHub button — enable in Clerk dashboard, add a sign-in option). Low risk.
- **Azure DevOps**: Azure DevOps's own OAuth 2.0 is **deprecated** — Microsoft stopped accepting new app registrations in April 2025 and is fully sunsetting it in 2026. Current guidance is to use **Microsoft Entra ID OAuth** with Azure DevOps–scoped (`vso.*`) permissions instead. Clerk has a built-in "Microsoft" social provider, but that's scoped for generic Microsoft identity — it's not clear yet whether it can be configured to request `vso` scopes, or whether this needs a **custom OAuth connection** in Clerk (a self-registered Entra ID app with the right API permissions). This needs a short research spike at the start of Feature 19, not an assumption baked in now.

## Proposed Architecture

Introduce a `GitProvider` interface that `lib/github/` becomes the first implementation of, rather than adding `if (provider === 'gitlab')` branches throughout the existing GitHub-specific modules. Shape (finalized in Feature 17):

- Auth: resolve a usable API token for the current user (mirrors `getGithubTokenForClerkUser`)
- Webhooks: verify signature + parse into a common event shape (PR opened/synchronized/closed, comment created)
- PR data: fetch diff, changed files, file contents at a ref
- Review output: post inline comments/suggestions, reply to a comment thread
- Commits: apply a fix as a commit on the PR branch
- Repo listing: list repos the user has access to, fetch one by full name

Directory shape: `lib/providers/github/`, `lib/providers/gitlab/`, `lib/providers/azure-devops/`, each implementing the shared interface from `lib/providers/types.ts`. Existing `lib/github/` code moves under this structure without behavior changes in Feature 17.

## Key Decision: One Account, Multiple Providers

A KOINCODE-Review user can connect both GitHub and GitLab (and later Azure DevOps) repos **on the same account** — connecting a second provider links an additional OAuth connection to the user's existing Clerk identity (via Clerk's `createExternalAccount()`/account-linking flow, surfaced as a "Connect GitLab" action in Settings), not a separate sign-up path. Rejected alternative: treating each provider as its own identity, which would silently fragment one person's repos/reviews/API keys across multiple KOINCODE accounts.

This was already implicitly assumed by the Feature 17 schema (`repos.provider` is a per-repo column, not a per-account one — nothing about the DB model treats "GitHub user" and "GitLab user" as different account types), but the auth-linking UI/flow itself doesn't exist yet. It's in scope for Feature 18, alongside GitLab's own webhook/PR/comment implementation.

## Sub-Features (spec'd individually, one at a time)

| # | Feature | Status |
|---|---|---|
| 17 | Provider abstraction refactor — define `GitProvider`, move existing GitHub code to implement it, zero behavior change | Done — see `context/feature-spec/17-git-provider-abstraction.md` |
| 18 | GitLab integration — Clerk social connection, webhook handling, PR/diff/comment API implementation | Done (backend + account-linking only — the "connect a GitLab repo" UI is still Feature 20) — see `context/feature-spec/18-gitlab-integration.md` |
| 19 | Azure DevOps integration — auth research spike (Entra ID custom OAuth connection, `vso` scopes) up front, then webhook/PR/comment API implementation | Not started |
| 20 | Landing page, onboarding & dashboard/repo UI for multi-provider (see below) | Not started |

The CLI integration (`/api/cli/repos/*`, `lib/repos/connect.ts`) currently identifies repos by GitHub `owner/repo` full name — this will need a provider-qualified identifier once a second provider exists. That change belongs inside whichever of 17/18/19 first makes it a live conflict, not spec'd separately in advance.

## Feature 20 Scope (expanded)

Two distinct UI surfaces, both landing in Feature 20 rather than split out, since both are "the UI catches up to a multi-provider backend":

- **Landing page — first sign-in provider picker.** Replaces the single "Continue with GitHub" button with a choice of GitHub / GitLab / Azure DevOps. This is a bigger change than it looks: it overturns the documented `CLAUDE.md` design decision ("Direct GitHub OAuth: No sign-in/sign-up pages, single login button triggers Clerk's GitHub OAuth flow directly") and means a brand-new account might have **no** GitHub connection at all. Every place that currently assumes a GitHub token exists right after signup — the dashboard's contribution-graph widget (GitHub-only, no generalization planned — see Feature 17's spec), onboarding copy, any bare `getGithubToken()` call not gated on "does this user actually have GitHub connected" — needs to treat "signed up via GitLab/Azure DevOps only" as a normal case. `CLAUDE.md`'s auth bullet gets updated once this ships, not before.
- **Settings — per-provider connect/disconnect.** Shows "Connect GitHub" / "Connect GitLab" / "Connect Azure DevOps" for whichever providers the user hasn't linked yet (via Clerk's additional-OAuth-connection flow — see "Key Decision" above), and a connected/manage state for the ones they have. This is the more contained half — extending the existing Settings page rather than touching the landing page.

Correction from an earlier draft of this scope line ("onboarding copy updates"): checked the actual files and `app/onboarding/page.tsx`/`components/Onboarding/onboarding-form.tsx` (the LLM-provider/API-key step) have no GitHub-specific text at all — nothing to change there. The real GitHub-specific copy that needs to become provider-neutral is: the landing page's "Continue with GitHub" button (`app/page.tsx`, already covered above), `components/Dashboard/GithubActivity.tsx`'s "Connect your GitHub account to start tracking activity", and `components/Repository/RepoList.tsx`'s "Manage and view all your GitHub repositories" / "Make sure your GitHub account has accessible repositories."

## Open Questions

- Whether Clerk's built-in Microsoft provider can be configured with `vso` scopes, or a custom Entra ID OAuth connection is required. Resolve at the start of Feature 19.
- Whether GitLab/Azure DevOps webhooks support the same suggestion-syntax inline comments GitHub does, or whether fix suggestions render differently per provider. Resolve during Features 18/19 implementation.
- Exact DB schema changes needed on `repos` (a `provider` column, provider-specific ID fields) — deferred to Feature 17 design, not decided here.
