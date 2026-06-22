# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase
- AI review pipeline — webhook ingestion, review agent, and comment posting.

## Current Goal
- Build Settings page "Repository Memory" card.

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
- Reviews page: fetches reviews from DB with cursor-based infinite scroll (IntersectionObserver), summary stat cards (total, completed, pending, failed), review cards with PR title, repo name, status badge, model, comment count, relative timestamps, review summary preview, and "View on GitHub" link. Server action in `lib/actions/reviews.ts`, client components: `ReviewList` (infinite scroll), `ReviewItem` (data card), `ReviewItemSkeleton` (loading state). Empty state when no reviews exist.
- Settings page: API Keys section with table layout (Provider, Encrypted Key, Model selector, Last Used, Status toggle, Delete). Server-fetches keys from DB with masked encrypted values. Model selector per provider, active/inactive toggle (only one key active at a time), delete action. PROVIDERS config extracted to `config/providers.ts` (shared with onboarding). Server actions in `lib/actions/api-keys.ts`. Repository Memory section with paginated table (25/page, 50 cap) showing repo name, rule text, source (manual/GitHub link), active toggle, created date, delete. "Add Rule" dialog for manual memory creation with repo selector and 280-char textarea. Server actions in `lib/actions/repo-memories.ts`.
- Onboarding flow (`/onboarding`): 3-step form (provider selection → model selection → API key entry). Supports Anthropic, OpenAI, Google, xAI providers. "Activate Code Reviews" saves encrypted key + marks onboarding complete. "Skip for now" marks onboarding complete without adding a key. Redirects to dashboard on completion.
- API key encryption/decryption utilities (`lib/crypto.ts`): AES-256-GCM with versioned envelope format (`v1:iv:tag:ciphertext`).
- Dashboard layout server component checks `hasCompletedOnboarding` flag and redirects to `/onboarding` if not completed.
- Initial indexing on connect: when a repo is connected, an Inngest background job fetches the repo tree (README, config files, top-level source) via GitHub API, generates embeddings via Gemini `text-embedding-004`, and upserts them into Pinecone (namespaced by `repo:{repoId}`). Repos schema extended with `indexingStatus` and `disconnectedAt` columns plus a unique constraint on `(user_id, github_id)`. Disconnect is now a soft-delete (`isActive = false`, `disconnectedAt = now()`). A daily Inngest cron job purges embeddings and DB rows for repos disconnected 30+ days. Reconnecting within the grace period skips re-indexing if embeddings already exist. Vector module created: `lib/vector/client.ts` (Pinecone client), `lib/vector/embeddings.ts` (Gemini embedding generation with chunking), `lib/vector/indexing.ts` (orchestrator). GitHub tree fetcher: `lib/github/tree.ts`. Inngest functions: `lib/inngest/functions.ts` (`index-repo`, `cleanup-disconnected-repos`). New env vars: `PINECONE_API_KEY`, `PINECONE_INDEX`, `GOOGLE_GENERATIVE_AI_API_KEY` (optional in env schema). Embeddings use Vercel AI SDK (`ai` + `@ai-sdk/google`).
- GitHub webhook endpoint (`POST /api/webhooks/github`): verifies HMAC-SHA256 signature, handles `pull_request` events (`opened` and `synchronize` actions), skips draft PRs, looks up connected repo by `githubId`, creates a `reviews` row with `pending` status, dispatches `pr/review-requested` Inngest event with PR metadata (number, title, URL, head SHA, branches, repo full name). Webhook auto-installation: `connectRepo` creates a GitHub webhook on the repo and stores the `webhookId`; `disconnectRepo` deletes the webhook and clears `webhookId`. Webhook helpers in `lib/github/webhooks.ts`. New env vars: `APP_URL` (webhook callback base URL), `GITHUB_WEBHOOK_SECRET` (now required).
- AI review agent pipeline (`process-review` Inngest function): full end-to-end review pipeline. Loads user config (API key, provider, model) from DB. Retrieves a fresh GitHub token via Clerk Backend API. Fetches PR diff and changed file list (`lib/github/diff.ts`), full file contents at head SHA (`lib/github/files.ts`), and codebase context from Pinecone (`lib/vector/retrieval.ts`). Builds a structured review prompt (`lib/ai/prompts.ts`) and calls the user's LLM via Vercel AI SDK `generateObject()` with Zod schema enforcement (`lib/ai/review.ts`). LLM provider factory (`lib/ai/providers.ts`) supports Anthropic, OpenAI, Google, and OpenRouter. Posts review comments to GitHub as a single PR review using GitHub's suggestion syntax (`lib/github/comments.ts`). Saves parsed comments and summary to the `reviews` table. Incrementally indexes changed files into Pinecone post-review. New dependencies: `@ai-sdk/anthropic`, `@ai-sdk/openai`.
- API key usage logs (Feature 08): `key_usage_logs` table with `ON DELETE SET NULL` for audit persistence. `runReview()` and `extractRule()` return usage/duration metadata; `generateEmbeddings()` returns tokens/duration. All Inngest functions (`process-review`, `process-comment-reply`, `index-repo`, `index-changed-files`) insert log rows after each LLM/embedding call with try/catch to never break the pipeline. Logs page at `/logs` with summary cards (total calls, total tokens, success rate, avg duration), filterable table (action, status, repo, date range), cursor-based pagination (25 rows), token breakdown tooltips, and status indicators. "Logs" nav item added to sidebar.
- Repository memory from PR comment replies: users reply to KOINCODE review comments on GitHub to teach the agent repo-specific conventions. Webhook subscribes to `pull_request_review_comment` events, detects replies to KOINCODE-authored comments, dispatches `comment/reply-received` Inngest event. `processCommentReply` function extracts a rule via the user's LLM, deduplicates against existing memories, stores in `repo_memories` table, and confirms on GitHub. Max 50 active memories per repo; rules capped at 280 chars. `processReview` loads active repo memories and injects them into the review prompt as "Repository Rules" section. Schema: `repo_memories` table (`lib/db/schema/repo-memories.ts`). Rule extraction: `lib/ai/memory.ts`. GitHub reply helper: `replyToComment` in `lib/github/comments.ts`.

## In Progress
- None.

## Next Up
- Dashboard page: wire up real stat counts (total repos, PRs, AI reviews) from DB instead of placeholders.

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
