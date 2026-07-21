# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Application Building Context

Read the following files in order before implementing or making any architectural decision:

1. `context/project-overview.md` — product definition, goals, features, and scope
2. `context/code-standards.md` — implementation rules and conventions
3. `context/ai-workflow-rules.md` — development workflow, scoping rules, and delivery approach
4. `context/progress-tracker.md` — current phase, completed work, open questions, and next steps

Update `context/progress-tracker.md` after each meaningful implementation change.

If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.

## What This Is

KOINCODE-Review is an AI-powered code review agent — a CodeRabbit alternative. Users sign in with GitHub, connect their repositories, bring their own LLM API key, and automatically receive AI-generated code reviews with fix suggestions on every pull request. Fixes can be applied (auto-committed) or resolved (dismissed).

## Commands

```bash
pnpm dev          # Start Next.js dev server
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint
pnpm db:generate  # Generate Drizzle migrations (once Drizzle is set up)
pnpm db:migrate   # Run Drizzle migrations (once Drizzle is set up)
```

## Environment Setup

```bash
# Auth (Clerk — GitHub/GitLab/Azure DevOps OAuth, no separate sign-in/sign-up pages)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   # Clerk publishable key
CLERK_SECRET_KEY=                     # Clerk secret key

# Database (Neon)
DATABASE_URL=                         # Neon Postgres connection string

# Vector Store (Pinecone)
PINECONE_API_KEY=                     # Pinecone API key
PINECONE_INDEX=                       # Pinecone index name

# Background Jobs (Inngest)
INNGEST_EVENT_KEY=                    # Inngest event key
INNGEST_SIGNING_KEY=                  # Inngest signing key

# GitHub
GITHUB_WEBHOOK_SECRET=                # GitHub webhook signing secret

# GitLab (optional — only needed once GitLab is enabled as a Clerk social connection)
GITLAB_WEBHOOK_SECRET=                # GitLab webhook secret token (sent via X-Gitlab-Token header)

# Azure DevOps (optional — only needed once a custom Entra ID app registration is set up as Clerk's Microsoft connection)
AZURE_DEVOPS_WEBHOOK_SECRET=          # Basic Auth password for auto-created service hooks (manual-setup repos use a per-repo secret instead)

# Encryption
ENCRYPTION_KEY=                       # AES-256-GCM key for encrypting user API keys at rest (openssl rand -hex 32)

# Embeddings (platform-owned, not user-provided)
GOOGLE_GENERATIVE_AI_API_KEY=          # Google AI API key for gemini-embedding-2 (free tier)
```

## Architecture

### App Layer (`app/`)
- `app/layout.tsx` — Root layout with Clerk provider and font setup.
- `app/page.tsx` — Landing page.
- `app/(dashboard)/` — Authenticated dashboard routes (repos, reviews, settings).
- `app/api/webhooks/` — Webhook endpoints (GitHub/GitLab/Azure DevOps PR events, Clerk user events).
- `app/api/inngest/` — Inngest serve endpoint for background job processing.

### Business Logic (`lib/`)
- `lib/ai/` — LLM provider abstraction, prompt templates, review agent orchestration.
- `lib/providers/` — `GitProvider` interface plus one implementation per git host (`github/`, `gitlab/`, `azure-devops/`), selected at runtime via `lib/providers/registry.ts` based on a repo's stored `provider` column.
- `lib/db/` — Drizzle client setup, schema definitions (`db/schema/`), query helpers.
- `lib/vector/` — Pinecone client, embedding generation, context retrieval.
- `lib/inngest/` — Inngest client, event definitions, background job functions (review, indexing).

### UI (`components/`)
- `components/ui/` — shadcn/ui primitives (do not modify generated source).
- `components/` — Composed application components.

### Configuration (`config/`)
- Environment variable validation and app constants.

## Key Design Decisions
- **BYOK (Bring Your Own Key):** Users provide their own LLM API keys for reviews. No built-in model hosting. This avoids billing complexity and lets users choose any provider.
- **Embedding model strategy:** If the user has a Google/Gemini API key, use theirs for embeddings (`gemini-embedding-2`). Otherwise, fall back to the platform-owned Gemini key. Saves platform quota when possible.
- **Hybrid vector indexing:** Lightweight initial index on connect (tree structure, README, config, top-level source), then incremental full-content indexing as files appear in PRs. Balances context coverage with cost.
- **Inngest for background jobs:** Event-driven architecture with built-in retries. Reviews are processed async — the webhook endpoint enqueues, the job executes.
- **Server Components first:** Data fetching happens in Server Components. Client Components are only used when browser APIs or interactivity are required.
- **Encrypted API key storage:** User LLM keys are AES-256-GCM encrypted at rest and only decrypted inside background jobs at the moment of LLM invocation.
- **Multi-provider OAuth, no separate sign-in/sign-up pages:** The landing page offers GitHub/GitLab/Azure DevOps sign-in buttons directly (no dedicated sign-up flow). A user can also link additional providers onto an existing account from Settings — one account, multiple connected git hosts, not a separate identity per provider.

@AGENTS.md
