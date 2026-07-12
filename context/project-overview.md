# KOINCODE-Review

## Overview
KOINCODE-Review is an AI-powered code review agent — a self-hosted alternative to CodeRabbit. Users sign in with GitHub, connect their repositories, bring their own LLM API key, and automatically receive AI-generated code reviews on every pull request with actionable fix suggestions.

## Goals
1. Let users sign in with GitHub via Clerk and connect any repo they own or have write access to.
2. Automatically review every PR opened against a connected repo using the user's chosen LLM.
3. Support any LLM provider (OpenAI, Anthropic, Google, etc.) — users bring their own API key.
4. Generate inline review comments with concrete code-fix suggestions.
5. Allow users to apply suggested fixes (auto-commit) or mark them as resolved.
6. Store repository context in a vector store so the reviewer understands the broader codebase.
7. Provide a dashboard where users manage connected repos, review history, and API keys.
8. Process reviews asynchronously via background jobs so the UI stays responsive.
9. Let a companion CLI tool (KOINCODE) pair with a user's account via a browser-based device-auth flow and connect/disconnect repos on their behalf, so the primary onboarding path doesn't have to be the web dashboard.

## Core User Flow
1. User visits the landing page and clicks the login button, which triggers GitHub OAuth directly (Clerk).
2. On first login, user is prompted to select an LLM model and provide an API key.
3. User navigates to the dashboard and connects one or more GitHub repositories.
4. A webhook is installed on each connected repo to listen for PR events.
5. When a PR is opened or updated, a background job triggers the AI review agent.
6. The agent fetches the PR diff, retrieves relevant codebase context from the vector store, and sends the review prompt to the user's chosen LLM.
7. The LLM response is parsed into inline review comments and posted to the PR via the GitHub API.
8. If a fix is suggested, the user can click "Apply Fix" (which commits the change) or "Resolve" (which dismisses the suggestion).
9. Users can view review history, manage API keys, and adjust settings from the dashboard.

## Features

### Authentication & Onboarding
- Direct GitHub OAuth sign-in via Clerk (single button press, no sign-in/sign-up pages)
- First-login onboarding flow: model selection + API key entry
- User profile and session management

### Repository Management
- List user's GitHub repos (personal + org)
- Connect / disconnect repos
- Automatic webhook installation on connected repos

### AI Code Review
- PR diff analysis with codebase context from vector store
- Inline review comments posted directly to GitHub PRs
- Code fix suggestions with diff previews
- Apply fix (auto-commit) or resolve (dismiss) actions

### Model & API Key Management
- Support for multiple LLM providers
- API key storage (AES-256-GCM encrypted) and validation
- Model selection per user (global default)
- Embeddings use the user's Google key when available, otherwise fall back to a platform-owned Gemini key

### Dashboard
- Connected repos overview
- Recent review history with status
- Review detail view (comments, fixes, outcomes)

### CLI Integration
- Browser-based device-authorization pairing (`/api/cli/device`, `/api/cli/device/token`) — no manually-generated tokens, no new sign-in UI beyond the existing GitHub OAuth
- Bearer-token-authenticated API for connecting/disconnecting a repo by GitHub `owner/repo` name, reusing the same connect/disconnect logic the dashboard uses
- See `context/feature-spec/14-cli-integration-auth.md`

### Background Processing
- Async PR review via Inngest background jobs
- Webhook event ingestion and queuing
- Hybrid repo indexing into Pinecone: lightweight initial index on connect (tree structure, README, config, top-level source), then incremental full-content indexing as files appear in PRs

## Scope

### In Scope
- GitHub integration (repos, PRs, webhooks, commits)
- Multi-provider LLM support (BYOK — bring your own key)
- Vector-based codebase context retrieval
- Inline PR review comments with fix suggestions
- Apply-fix auto-commit flow
- User dashboard for repo, key, and review management
- Background job processing for reviews and indexing

### Out of Scope
- GitLab / Bitbucket support (GitHub only for v1)
- Built-in LLM hosting — users must provide their own API keys
- Billing / subscription management
- Team or organization-level accounts
- Real-time chat with the reviewer agent
- IDE extensions
- Self-hosted deployment guides

CLI tools were previously listed here as out of scope — narrowed, not reversed: KOINCODE-Review does not ship its own CLI, but does expose a minimal token-based API (`/api/cli/*`) so the separate KOINCODE terminal app can pair an account and connect/disconnect repos. See `context/feature-spec/14-cli-integration-auth.md`.

## Success Criteria
1. A user can sign in, add an API key, connect a repo, and receive an automated review on their next PR — end to end.
2. Reviews include contextually relevant inline comments, not just generic lint-style feedback.
3. Applying a suggested fix creates a valid commit on the PR branch.
4. The system handles concurrent PR events without dropping reviews.
5. API keys are stored securely and never exposed in logs or UI.
6. The review turnaround time is under 2 minutes for a typical PR (< 500 lines changed).
