# Code Standards

## General
- Keep files under 300 lines. If a file grows past that, split by responsibility.
- Fail fast at system boundaries (API routes, webhooks, user input). Trust internal code and framework guarantees — don't add defensive checks deep inside.
- Never log, expose, or return API keys or secrets. Use encrypted storage and redact in error messages.
- Prefer explicit over clever. No magic strings, no implicit coupling between modules.
- Every public-facing API route must validate its input (zod schemas).

## TypeScript
- Strict mode is on — no `any`, no `as` casts unless unavoidable (add a comment explaining why).
- Use `interface` for object shapes, `type` for unions and intersections.
- Prefer named exports over default exports (except for Next.js page/layout conventions).
- Use zod for runtime validation at API boundaries. Infer TypeScript types from zod schemas (`z.infer<typeof schema>`).
- Return early from functions — avoid deep nesting.
- Use `const` by default. Only use `let` when reassignment is required.

## Next.js
- Read `node_modules/next/dist/docs/` before using any Next.js API — this is Next.js 16 with breaking changes from prior versions.
- App Router only. No `pages/` directory.
- Server Components by default. Only add `"use client"` when the component needs browser APIs, event handlers, or React state.
- API routes go in `app/api/`. Use route handlers (`route.ts`) for webhook endpoints and external integrations.
- Server Actions for mutations triggered from the UI (form submissions, button clicks).
- Keep data fetching in Server Components — no `useEffect` + `fetch` patterns.
- Use the `@/` path alias for imports.

## Styling
- Tailwind CSS 4 for all styling. No CSS modules, no styled-components.
- Use shadcn/ui components as the design system foundation — install components as needed via the CLI.
- Keep component-specific styles inline with Tailwind classes. Extract to shared components (not utility CSS classes) when reuse is needed.

## Database & ORM
- Drizzle ORM for all database access. No raw SQL outside of migrations.
- Define schemas in a dedicated `db/schema/` directory, one file per domain (e.g., `users.ts`, `repos.ts`, `reviews.ts`).
- Use Drizzle's query builder — avoid string interpolation in queries.
- Migrations are managed via `drizzle-kit`.

## API Keys & Secrets
- Store user API keys encrypted at rest in the database.
- Decrypt only at the moment of use (inside the background job that calls the LLM).
- Never return decrypted keys to the client. The UI should show only a masked version.

## File Organisation
- `app/` — Next.js routes, layouts, pages, and API route handlers.
- `app/api/` — Webhook endpoints and REST API routes.
- `components/` — Shared React components (UI primitives and composed components).
- `lib/` — Core business logic, utilities, and service modules.
- `lib/ai/` — LLM provider abstraction, prompt templates, review agent logic.
- `lib/github/` — Octokit wrappers, webhook handling, PR operations.
- `lib/db/` — Drizzle client, schema definitions, and migrations.
- `lib/vector/` — Pinecone client and embedding/retrieval logic.
- `lib/inngest/` — Background job definitions and event handlers.
- `config/` — App configuration, constants, and environment variable validation.
