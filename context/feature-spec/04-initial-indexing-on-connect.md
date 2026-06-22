# Feature 4: Initial Indexing on Connect + Deferred Cleanup

## Overview

When a user connects a repository, a background job fetches a lightweight snapshot of the repo (tree structure, READMEs, config files) and indexes it into Pinecone as vector embeddings. This gives the AI review agent baseline structural context before any PR is opened. Source code is **not** indexed upfront — it enters the vector store incrementally as files appear in PRs.

When a user disconnects a repository, embeddings are **not** deleted immediately. Instead, a `disconnectedAt` timestamp is recorded. A daily cron job purges embeddings for repos that have been disconnected for 30+ days without reconnecting. If the user reconnects within the grace period, the existing embeddings are preserved and re-indexing is skipped.

## Why

- The review agent needs codebase context to produce relevant, non-generic reviews. Without an initial index, the first PR review would have zero context.
- Re-indexing is expensive (GitHub API calls + embedding API calls), so a 30-day grace period on disconnect avoids wasted work when users toggle repos.

## User Flow

1. User clicks "Connect" on a repo in the Repositories page.
2. Repo row is inserted into `repos` table with `indexingStatus = 'pending'`.
3. An Inngest event `repo/connected` is fired.
4. The `index-repo` Inngest function picks up the event:
   a. Sets `indexingStatus` to `'indexing'`.
   b. Fetches the repo tree via GitHub API (default branch).
   c. Selects lightweight files: READMEs (any depth), config files (package.json, tsconfig, etc.), and the full directory tree structure. No source files.
   d. Generates embeddings using Gemini `gemini-embedding-2` (platform key, free tier).
   e. Upserts vectors into Pinecone, namespaced by `repo:{repoId}`.
   f. Sets `indexingStatus` to `'completed'`.
   g. On failure, sets `indexingStatus` to `'failed'`.
5. User clicks "Disconnect" on a repo.
6. Repo is soft-deleted: `isActive = false`, `disconnectedAt = now()`.
7. A daily Inngest cron function `cleanup-disconnected-repos` runs:
   a. Finds all repos where `isActive = false` and `disconnectedAt` is 30+ days ago.
   b. Deletes their Pinecone namespace (`repo:{repoId}`).
   c. Hard-deletes the repo row from the database.
8. If the user reconnects within 30 days:
   a. `isActive` is set back to `true`, `disconnectedAt` is cleared.
   b. If `indexingStatus` is already `'completed'`, no re-indexing is needed.

## Schema Changes

### `repos` table additions

| Column           | Type        | Default     | Notes                                              |
|------------------|-------------|-------------|----------------------------------------------------|
| `indexing_status`| text        | `'pending'` | One of: `pending`, `indexing`, `completed`, `failed`|
| `disconnected_at`| timestamp   | null        | Set on disconnect, cleared on reconnect            |

### Unique constraint

Add a unique constraint on `(user_id, github_id)` to support `ON CONFLICT DO UPDATE` for reconnection.

## Files Changed / Created

- `lib/db/schema/repos.ts` — Add `indexingStatus`, `disconnectedAt` columns and unique constraint.
- `config/env.ts` — Add `PINECONE_API_KEY`, `PINECONE_INDEX`, `GOOGLE_GENERATIVE_AI_API_KEY`.
- `lib/vector/client.ts` — Pinecone client initialization.
- `lib/vector/embeddings.ts` — Gemini embedding generation.
- `lib/vector/indexing.ts` — Orchestrates fetching files, generating embeddings, upserting to Pinecone.
- `lib/github/tree.ts` — Fetch repo tree and file contents via GitHub API.
- `lib/inngest/functions.ts` — `index-repo` function and `cleanup-disconnected-repos` cron.
- `lib/actions/repos.ts` — Update `connectRepo` (upsert + fire event), `disconnectRepo` (soft-delete).
- `app/api/inngest/route.ts` — Register new Inngest functions.

## Embedding Strategy

- **Model:** Gemini `gemini-embedding-2` (free tier, 3072 dimensions).
- **Key source:** If the user has a Google API key in `api_keys`, use theirs (decrypted at runtime). Otherwise fall back to the platform-owned `GOOGLE_GENERATIVE_AI_API_KEY` env var (auto-read by Vercel AI SDK).
- **Chunking:** Each file is one document. Files over 4,000 characters are split into chunks of ~4,000 characters with 200-character overlap.
- **Metadata per vector:** `repoId`, `filePath`, `fileType` (readme / config / source / tree), `chunkIndex`.

## Files Selected for Initial Index

The lightweight index targets files that give the review agent structural and project-level understanding — no source code:

1. **Tree structure** — Full directory listing (serialized as a single document).
2. **README files** — `README.md`, `README`, `readme.rst`, `readme.txt` at any depth in the repo.
3. **Config files** — `package.json`, `tsconfig.json`, `pyproject.toml`, `.eslintrc.*`, `Cargo.toml`, `go.mod`, `Gemfile`, `requirements.txt`, `Makefile`, `Dockerfile`, `docker-compose.yml`, and similar.

Max 30 files indexed per repo in the initial pass. Source files enter the vector store incrementally when they appear in PRs.

## Incremental PR Indexing

When a file appears in a PR, it is indexed (or re-indexed) into the vector store:

1. **Delete stale vectors** — All existing vectors for the file path are deleted from the namespace using a metadata filter (`filePath == "path/to/file"`). This handles the case where a file shrinks and produces fewer chunks than before.
2. **Embed and upsert** — The new file content is chunked, embedded, and upserted with the same deterministic vector IDs (`{repoId}:{filePath}:{chunkIndex}`).

This is handled by `indexChangedFiles()` in `lib/vector/indexing.ts`, which will be called from the PR review pipeline.

## Pinecone Namespace Strategy

Each repo gets its own namespace: `repo:{repoId}` (using the DB UUID). This allows:
- Efficient deletion on cleanup (delete entire namespace).
- Isolated context retrieval per repo during reviews.

## Error Handling

- If GitHub API fails (rate limit, repo deleted), the job retries via Inngest's built-in retry mechanism.
- If Gemini embedding fails, the job retries.
- After all retries exhausted, `indexingStatus` is set to `'failed'`.
- Failed repos can be re-indexed by disconnecting and reconnecting.

## Cron Schedule

The `cleanup-disconnected-repos` function runs daily at 03:00 UTC via Inngest cron trigger.
