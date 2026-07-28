# Contributing to KOINCODE Review

Thanks for your interest in contributing. KOINCODE Review is an AI-powered code review agent, and we welcome contributions of all sizes.

## Ways to Contribute

The most common types of changes that get merged:

- Bug fixes
- Support for additional LLM providers (the app already supports Anthropic, OpenAI, Google, and OpenRouter via the [AI SDK](https://ai-sdk.dev))
- Improvements to review quality (prompt tuning, better fix suggestions, fewer false positives)
- GitHub integration improvements (webhook handling, comment posting, commit creation)
- Documentation improvements

New UI flows, new core product features, or anything that changes how reviews are generated end-to-end should start as a discussion (open an issue) before you put time into a PR. This avoids wasted work if the direction doesn't fit the project.

If you're unsure whether a change would be accepted, open an issue first and ask.

## Before You Start

This repo documents its own architecture and conventions — read these before writing code:

1. [`context/project-overview.md`](context/project-overview.md) — what the product does and its current scope
2. [`context/code-standards.md`](context/code-standards.md) — TypeScript, Next.js, styling, and database conventions
3. [`context/ai-workflow-rules.md`](context/ai-workflow-rules.md) — module ownership boundaries and scoping rules
4. [`context/progress-tracker.md`](context/progress-tracker.md) — current phase and what's already been built

This is also a Next.js 16 project with breaking changes from earlier versions — check `node_modules/next/dist/docs/` before relying on API behavior you remember from older Next.js.

## Development Setup

**Requirements:** Node 22+, pnpm 9+

```bash
git clone https://github.com/KONY05/KOINCODE-Review.git
cd KOINCODE-Review
pnpm install
cp .env.example .env.local  # fill in the values below
pnpm db:generate
pnpm db:migrate
pnpm dev
```

### External services

Some features require accounts with third-party services. You don't need all of them for every contribution — see the table below.

| Service | Env vars | Needed for |
|---|---|---|
| [Clerk](https://clerk.com) (GitHub OAuth) | `CLERK_*` | Sign-in, any authenticated route |
| [Neon](https://neon.tech) (Postgres) | `DATABASE_URL` | Anything touching the database |
| GitHub App/webhook | `GITHUB_WEBHOOK_SECRET` | PR review flow, webhook handling |
| [Pinecone](https://pinecone.io) | `PINECONE_API_KEY`, `PINECONE_INDEX` | Codebase context / vector retrieval |
| [Inngest](https://inngest.com) | `INNGEST_DEV="1"` (local dev mode, no key needed) | Background review jobs |
| Google AI | `GOOGLE_GENERATIVE_AI_API_KEY` | Embeddings (platform-owned fallback) |

Sentry and Mixpanel vars are optional in local dev — leave them blank.

If you're working on something UI-only (e.g., dashboard components, styling), you can usually get away with just `DATABASE_URL` and Clerk configured. See `.env.example` for the full list.

For webhook delivery in local dev, expose your local server with ngrok or a Cloudflare tunnel and set `APP_URL` accordingly.

## Making Changes

- Respect the module boundaries in `context/ai-workflow-rules.md` — e.g., all LLM calls go through `lib/ai/`, all GitHub API calls go through `lib/github/`, nothing instantiates its own database connection outside `lib/db/`.
- Don't hand-edit generated Drizzle migrations or `components/ui/` (shadcn) source — wrap or extend instead.
- Keep files under ~300 lines; split by responsibility if a file grows past that.
- Follow the existing code standards: `type` over `interface`, zod validation at API boundaries, Server Components by default, Tailwind for styling.

## Validating Your Changes

```bash
pnpm run validate   # lint + typecheck, same check CI runs on every PR
```

CI (`.github/workflows/ci.yml`) runs `pnpm run validate` against every PR targeting `main`. PRs that don't pass won't be merged.

For logic changes, explain in the PR how you verified the fix — what you tested and how a reviewer can reproduce it. For UI changes, include a screenshot or short clip of before/after.

## Pull Requests

- Keep PRs small and focused on one change. If you're touching more than ~3 unrelated directories, consider splitting the work.
- Reference an issue if one exists (`Fixes #123`), especially for anything beyond a trivial fix.
- Write a short, plain-language description of what changed and why — long AI-generated PR descriptions will likely just get asked to be shortened.
- If your change touches `context/*.md` because it affects architecture, scope, or standards, update the relevant file in the same PR.

### Commit / PR title format

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature or functionality
- `fix:` — bug fix
- `docs:` — documentation changes
- `chore:` — maintenance, dependency updates
- `refactor:` — code change that doesn't change behavior
- `test:` — adding or updating tests

Examples: `fix: persist PR comment replies`, `feat: add repository memory rules`, `docs: update contributing guidelines`.

## Reporting Bugs / Requesting Features

Open a GitHub issue with:

- What you expected to happen vs. what actually happened
- Steps to reproduce (for bugs)
- Enough context for a maintainer to act on it without back-and-forth

Keep it concise — a short, clear issue gets triaged faster than a long one.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
