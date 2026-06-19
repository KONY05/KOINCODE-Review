# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase
- Project Setup — core dependencies installed, foundational structure established.

## Current Goal
- Build the onboarding flow (model selection + API key entry after first sign-in).

## Completed
- Initial Next.js 16 scaffold with TypeScript, Tailwind CSS 4, and pnpm (Create Next App).
- Project context documentation (`CLAUDE.md`, `AGENTS.md`, `context/` files).
- Core dependency installation: Clerk, Drizzle, Neon, Inngest, Pinecone, Octokit, Zod, shadcn/ui.
- Clerk auth setup: `ClerkProvider` in root layout, `proxy.ts` with route protection (direct GitHub OAuth, no sign-in/sign-up pages).
- Database schema: `users`, `repos`, `api_keys`, `reviews` tables defined with Drizzle ORM.
- Drizzle config and migration scripts (`db:generate`, `db:migrate`, `db:studio`).
- Inngest client setup and serve endpoint at `/api/inngest`.
- Environment variable template (`.env.local`) and validation module (`config/env.ts`).
- shadcn/ui initialized with base-nova style, button component, and CSS variables.

## In Progress
- None.

## Next Up
- Build the onboarding flow (model selection + API key entry after first sign-in).
- Build the dashboard layout and landing page.
- Build the repository connection page (list GitHub repos, connect/disconnect).
- Set up GitHub webhook endpoint to receive PR events.
- Implement API key encryption/decryption utilities.
- Implement the AI review agent (diff analysis, vector context retrieval, LLM call, comment posting).
- Set up Pinecone vector store for repo indexing.
- Build review history and detail views.
- Implement apply-fix and resolve flows.

## Open Questions
- None.

## Architecture Decisions
- Next.js 16 App Router with Server Components for data fetching and Server Actions for mutations.
- Clerk for auth — handles GitHub OAuth, session management, and user metadata.
- Drizzle ORM over Neon (serverless Postgres) — type-safe queries with migration support.
- Inngest for background jobs — event-driven, with built-in retries and observability.
- Pinecone for vector storage — used to provide codebase context to the review agent.
- BYOK (bring your own key) model — no built-in LLM hosting. Users provide API keys for their preferred provider.
- Octokit for all GitHub API operations — webhooks, PR reads, review comments, commits.
- Next.js 16 uses `proxy.ts` instead of `middleware.ts` — Clerk's `clerkMiddleware` is exported as the default from `proxy.ts`.
- Zod v4 (`zod/v4` import path) for runtime validation at API boundaries.
- AES-256-GCM for encrypting user API keys at rest. Stored as versioned envelope: `v{n}:iv:tag:ciphertext`. Supports key rotation via re-encryption migration. Decrypt only inside background jobs at moment of LLM invocation.
- All DB primary keys use `uuid().defaultRandom()` — Postgres-generated, no app-side ID creation.
- Review comments include optional `suggestedDiff` (`{ oldCode, newCode }`) for rendering before/after diffs alongside the "Apply Fix" action.
- Hybrid vector indexing: lightweight initial index on connect (tree structure, README, config files, top-level source), then incrementally index full file content as files appear in PRs. Vector store fills naturally with code that actually changes.
- Embedding model strategy: if the user has a Google/Gemini API key, use their key for embeddings. Otherwise, fall back to the platform-owned Gemini key (`text-embedding-004`, free tier). Saves platform quota when possible.
- Auth is direct GitHub OAuth via Clerk — no sign-in/sign-up pages, just a login button that triggers OAuth.

## Session Notes
- Next.js version is 16.2.9 — has breaking changes from prior versions. Always check `node_modules/next/dist/docs/` before using Next.js APIs.
- Key Next.js 16 breaking changes: `params`, `searchParams`, `cookies`, `headers` are all async (must `await`). `middleware.ts` → `proxy.ts`. Turbopack is default.
- Package manager is pnpm.
- Tailwind CSS version is 4 (PostCSS plugin via `@tailwindcss/postcss`).
- Path alias `@/` is configured in tsconfig.json.
- shadcn/ui uses base-nova style with neutral base color and lucide icons.
