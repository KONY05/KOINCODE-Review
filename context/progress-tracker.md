# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase
- AI review pipeline — webhook ingestion, review agent, and comment posting.

## Current Goal
- Implement the AI review agent (diff analysis, vector context retrieval, LLM call, comment posting).

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
- Landing page implemented from Claude Design mockup: split-screen layout with hero (left) and GitHub OAuth login (right). Fonts switched to IBM Plex Sans + JetBrains Mono. Full light/dark mode support via `next-themes` with system preference detection. Custom color palette matching the design (amber accent, cream buttons, muted grays). Theme toggle component added.
- Clerk webhook (`POST /api/webhooks/clerk`): verifies `svix` signature, handles `user.created` event, inserts user into `users` table with `ON CONFLICT DO NOTHING` for idempotency. Extracts `clerkId`, `email`, `name`, `avatarUrl`, `githubUsername` from the webhook payload.
- Collapsible sidebar dashboard layout using shadcn/ui `Sidebar` component: GitHub account card, nav menu (Dashboard, Repositories, Reviews, Settings), user footer with sign-out dropdown. Sticky header with sidebar toggle and breadcrumb. Keyboard shortcut (Cmd+B) to toggle sidebar. Mobile responsive via sheet overlay.
- Dashboard page: stat cards (Total Repos, Commits, PRs, AI Reviews), contribution activity placeholder, activity overview chart placeholder.
- Repository page: fetches user repos from GitHub API via Octokit, paginated with infinite scroll (IntersectionObserver), "All" / "Connected" tab toggle (inline with page heading), debounced search (client-side for All tab, server-side for Connected tab), connect/disconnect with optimistic UI, language badges with colored dots, relative timestamps, empty states for each tab/search combo. Server actions in `lib/actions/repos.ts`, GitHub fetching in `lib/github/repos.ts`.
- Reviews page skeleton: review card placeholders with status badges, code preview areas, and "View on GitHub" buttons.
- Settings page: API Keys section with "Add Key" button linking to onboarding, key row placeholders, Repository Memory concept card.
- Onboarding flow (`/onboarding`): 3-step form (provider selection → model selection → API key entry). Supports Anthropic, OpenAI, Google, xAI providers. "Activate Code Reviews" saves encrypted key + marks onboarding complete. "Skip for now" marks onboarding complete without adding a key. Redirects to dashboard on completion.
- API key encryption/decryption utilities (`lib/crypto.ts`): AES-256-GCM with versioned envelope format (`v1:iv:tag:ciphertext`).
- Dashboard layout server component checks `hasCompletedOnboarding` flag and redirects to `/onboarding` if not completed.
- Initial indexing on connect: when a repo is connected, an Inngest background job fetches the repo tree (README, config files, top-level source) via GitHub API, generates embeddings via Gemini `text-embedding-004`, and upserts them into Pinecone (namespaced by `repo:{repoId}`). Repos schema extended with `indexingStatus` and `disconnectedAt` columns plus a unique constraint on `(user_id, github_id)`. Disconnect is now a soft-delete (`isActive = false`, `disconnectedAt = now()`). A daily Inngest cron job purges embeddings and DB rows for repos disconnected 30+ days. Reconnecting within the grace period skips re-indexing if embeddings already exist. Vector module created: `lib/vector/client.ts` (Pinecone client), `lib/vector/embeddings.ts` (Gemini embedding generation with chunking), `lib/vector/indexing.ts` (orchestrator). GitHub tree fetcher: `lib/github/tree.ts`. Inngest functions: `lib/inngest/functions.ts` (`index-repo`, `cleanup-disconnected-repos`). New env vars: `PINECONE_API_KEY`, `PINECONE_INDEX`, `GOOGLE_GENERATIVE_AI_API_KEY` (optional in env schema). Embeddings use Vercel AI SDK (`ai` + `@ai-sdk/google`).
- GitHub webhook endpoint (`POST /api/webhooks/github`): verifies HMAC-SHA256 signature, handles `pull_request` events (`opened` and `synchronize` actions), skips draft PRs, looks up connected repo by `githubId`, creates a `reviews` row with `pending` status, dispatches `pr/review-requested` Inngest event with PR metadata (number, title, URL, head SHA, branches, repo full name). Inngest stub function (`process-review`) registered and logs the event — placeholder for the full review agent pipeline. Webhook auto-installation: `connectRepo` creates a GitHub webhook on the repo and stores the `webhookId`; `disconnectRepo` deletes the webhook and clears `webhookId`. Webhook helpers in `lib/github/webhooks.ts`. New env vars: `APP_URL` (webhook callback base URL), `GITHUB_WEBHOOK_SECRET` (now required).

## In Progress
- None.

## Next Up
- Implement the AI review agent (diff analysis, vector context retrieval, LLM call, comment posting).
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
