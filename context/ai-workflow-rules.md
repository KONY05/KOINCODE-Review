# AI Workflow Rules

## Approach
Build one feature at a time, spec-first. Before writing code, confirm the scope of the current feature against `context/progress-tracker.md`. Implement incrementally — get the simplest version working end-to-end before adding edge cases or polish.

## Scoping Rules
- Work on exactly one feature at a time. Finish it before starting the next.
- A feature is "done" when it works end-to-end, not when the happy path compiles.
- Do not refactor or improve code outside the current feature unless it blocks progress.
- If a dependency (e.g., a database table, an API route) doesn't exist yet, build just enough of it to unblock the current feature — mark the rest as "Next Up" in the progress tracker.
- Do not add abstractions, helpers, or shared utilities until there are at least two concrete consumers.

## When To Split Work
- The feature requires changes across more than 3 unrelated directories.
- You need to set up a new external integration (Clerk, Pinecone, Inngest) as a prerequisite.
- The implementation requires both a new database schema and a new API surface.
- A single step would produce more than ~200 lines of new code.
- You find yourself saying "first we need to…" more than once.

## Handling Missing Requirements
- If a UI layout or flow isn't specified, implement a clean, minimal version and note the assumption in the progress tracker.
- If a technical choice isn't specified (e.g., encryption algorithm for API keys), pick the standard/recommended option and document it.
- Never block on a missing requirement — implement with a reasonable default and flag it.
- If a requirement seems contradictory, implement the safer interpretation and note the conflict.

## Package / Module Boundaries
- `lib/ai/` owns all LLM interactions. No other module should import provider SDKs directly.
- `lib/github/` owns all GitHub API calls. Components and routes use its exported functions, not Octokit directly.
- `lib/db/` owns the Drizzle client and schema. Other modules import from `lib/db/` — they never instantiate their own database connections.
- `lib/vector/` owns Pinecone operations. Other modules call its retrieval/indexing functions.
- `lib/inngest/` owns background job definitions. Routes and actions enqueue events — they don't run job logic inline.
- `components/` contains only presentational and interactive UI. No data fetching, no direct database access.

## Protected Foundation Components
- `drizzle.config.ts` and migration files — do not modify generated migrations by hand.
- `next.config.ts` — only modify when adding a documented configuration option.
- `tailwind.config.*` / `postcss.config.*` — only modify for plugin additions.
- shadcn/ui component files in `components/ui/` — do not modify generated component source. Wrap or extend instead.
- Clerk middleware and provider setup — follow Clerk's documented patterns exactly.

## Keeping Docs In Sync
- Update `context/progress-tracker.md` after completing each feature or making an architecture decision.
- If a new directory is added to `File Organisation` in code-standards, update `context/code-standards.md`.
- If scope changes (feature added or removed), update `context/project-overview.md`.
- If a new environment variable is required, add it to the `CLAUDE.md` Environment Setup section.

## Before Moving To The Next Feature
1. The feature works end-to-end (not just the happy path).
2. Input validation is in place for any new API routes or server actions.
3. Error states are handled — the user sees a meaningful message, not a crash.
4. No TypeScript errors (`pnpm build` passes).
5. `context/progress-tracker.md` is updated with the completed feature and the next goal.
6. Any new environment variables are documented.
