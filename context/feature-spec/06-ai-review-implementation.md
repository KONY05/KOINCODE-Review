# Feature 6: AI Review Agent Pipeline

## Overview

When a `pr/review-requested` Inngest event fires, the `process-review` function executes the full review pipeline: fetch the PR diff from GitHub, retrieve relevant codebase context from Pinecone, decrypt the user's API key and call their chosen LLM with a structured review prompt, parse the response into inline review comments, post those comments to the PR via the GitHub API, and update the `reviews` row with the results.

Changed files from the PR diff are also incrementally indexed into the vector store so future reviews of the same repo have richer context.

## Why

This is the core product feature — everything built so far (auth, repo connection, webhooks, vector indexing) feeds into this pipeline. Without it, the app captures PR events but does nothing with them.

## Pipeline Steps

The `process-review` Inngest function executes these steps in order:

### 1. Load review context from DB

- Fetch the `reviews` row by `reviewId` to get `repoId`, `userId`, `prNumber`.
- Fetch the user's default API key from `api_keys` (where `isDefault = true`).
- If no API key exists, mark the review as `failed` with a summary explaining why, and return early.
- Decrypt the API key using `decrypt()`.
- Set review status to `in_progress`.

### 2. Fetch the PR diff from GitHub

Create `lib/github/diff.ts`:

- `fetchPRDiff(token, owner, repo, prNumber)` — calls the GitHub API (`GET /repos/{owner}/{repo}/pulls/{prNumber}`) with `Accept: application/vnd.github.diff` header to get the raw unified diff.
- `fetchPRFiles(token, owner, repo, prNumber)` — calls `GET /repos/{owner}/{repo}/pulls/{prNumber}/files` to get the list of changed files with their `filename`, `status`, `patch`, `additions`, `deletions`, and `raw_url`.
- Parse the file list into a structured format the prompt can consume.

### 3. Fetch file contents for changed files

Create `lib/github/files.ts`:

- `fetchFileContent(token, owner, repo, path, ref)` — calls `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` to get the full content of a file at a specific commit SHA.
- For each changed file in the PR (status `modified` or `added`), fetch the full file content at the head SHA. This gives the LLM the complete file for context, not just the patch hunks.
- Skip files over 100KB (binary or too large for useful review).
- Skip files matching common non-reviewable patterns: lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), generated files (`*.min.js`, `*.min.css`), images, fonts.

### 4. Retrieve codebase context from Pinecone

Create `lib/vector/retrieval.ts`:

- `retrieveContext(repoId, query, googleApiKey?, topK?)` — generates an embedding for the query string, then queries the `repo:{repoId}` Pinecone namespace for the top-K most similar vectors (default K=10).
- Returns the matched text chunks with their `filePath` and similarity score.
- The query is derived from the PR: concatenate the PR title, file paths, and a summary of the changes to form a meaningful search query.
- Filter results to a minimum similarity threshold (0.7) to avoid injecting irrelevant context.

### 5. Build the review prompt

Create `lib/ai/prompts.ts`:

- `buildReviewPrompt(params)` — constructs the system prompt and user message for the LLM.
- **System prompt:** You are an expert code reviewer. Review the PR diff for bugs, security issues, performance problems, and code quality. Provide specific, actionable inline comments. For each issue found, include a suggested fix as a code diff. Be concise — skip praise, skip trivial style nits.
- **User message structure:**
  - PR metadata: title, branch info, number of files changed.
  - Codebase context: relevant code snippets from the vector store (with file paths).
  - Changed files: full file contents for modified/added files.
  - PR diff: the unified diff.
- **Response format instruction:** Return a JSON array of review comments, each with: `path` (file path), `line` (line number in the diff), `body` (review comment), `suggestion` (optional suggested code replacement).

### 6. Call the user's LLM

Create `lib/ai/providers.ts`:

- `createLLMClient(provider, apiKey)` — returns a Vercel AI SDK provider instance for the user's chosen provider.
- Supported providers:
  - `anthropic` → `@ai-sdk/anthropic` (`createAnthropic`)
  - `openai` → `@ai-sdk/openai` (`createOpenAI`)
  - `google` → `@ai-sdk/google` (`createGoogleGenerativeAI`)
  - `openrouter` → `@openrouter/ai-sdk-provider` (`createOpenRouter`)

Create `lib/ai/review.ts`:

- `runReview(params)` — the main review orchestrator.
- Uses Vercel AI SDK `generateObject()` with a Zod schema to get structured output from the LLM.
- The Zod schema enforces the review comment shape: `z.object({ comments: z.array(z.object({ path, line, body, suggestion })) })`.
- Pass the model string from the user's `api_keys.model` column directly to the provider.
- Set a reasonable `maxTokens` (4096) to bound cost.

### 7. Post review comments to GitHub

Create `lib/github/comments.ts`:

- `postReviewComments(token, owner, repo, prNumber, headSha, comments)` — uses the GitHub "create a review" API (`POST /repos/{owner}/{repo}/pulls/{prNumber}/reviews`) to post all comments as a single PR review.
- Each comment maps to a review comment with `path`, `line` (mapped to `position` in the diff), and `body`.
- If a comment has a `suggestion`, format it using GitHub's suggestion syntax:
  ````
  ```suggestion
  suggested code here
  ```
  ````
- The review event is set to `COMMENT` (not `APPROVE` or `REQUEST_CHANGES`).
- `mapDiffLineToPosition(diff, filePath, line)` — helper to convert an absolute file line number to a diff position (GitHub's 1-based position within the file's patch hunk). This mapping is required because GitHub's review comment API uses diff positions, not file line numbers.

### 8. Incrementally index changed files

- For each changed file with status `modified` or `added`, pass the full file content to `indexChangedFiles()` from `lib/vector/indexing.ts`.
- Use the user's Google API key for embeddings if available, otherwise fall back to the platform key.
- This runs after the review is posted so it doesn't block the review turnaround time.

### 9. Update the review record

- Store the parsed comments array in `reviews.comments` (JSONB).
- Store the model used in `reviews.model`.
- Generate a brief summary of the review (e.g., "Found 3 issues: 1 bug, 1 security concern, 1 performance suggestion") and store in `reviews.summary`.
- Set `reviews.status` to `completed` and `reviews.completedAt` to `now()`.
- On any failure, set status to `failed` and store the error reason in `summary`.

## Files Created

| File | Purpose |
|------|---------|
| `lib/github/diff.ts` | Fetch PR diff and changed file list |
| `lib/github/files.ts` | Fetch full file contents at a specific ref |
| `lib/github/comments.ts` | Post PR review comments via GitHub API |
| `lib/ai/providers.ts` | LLM provider factory (Vercel AI SDK) |
| `lib/ai/prompts.ts` | Review prompt construction |
| `lib/ai/review.ts` | Review orchestrator — calls LLM, parses response |
| `lib/vector/retrieval.ts` | Query Pinecone for relevant codebase context |

## Files Modified

| File | Change |
|------|--------|
| `lib/inngest/functions.ts` | Replace `processReview` stub with full pipeline |
| `app/api/inngest/route.ts` | No change needed — `processReview` is already registered |

## New Dependencies

| Package | Purpose |
|---------|---------|
| `@ai-sdk/anthropic` | Anthropic provider for Vercel AI SDK |
| `@ai-sdk/openai` | OpenAI provider for Vercel AI SDK |
| `@openrouter/ai-sdk-provider` | OpenRouter provider for Vercel AI SDK |

`@ai-sdk/google` and `ai` are already installed (used for embeddings).

## Inngest Event Data Shape

The `pr/review-requested` event (already dispatched by the webhook route) carries:

```typescript
type PRReviewRequestedEvent = {
  reviewId: string;
  repoId: string;
  userId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  headSha: string;
  headBranch: string;
  baseBranch: string;
  repoFullName: string;
};
```

## LLM Response Schema

The LLM is instructed to return structured JSON matching this Zod schema:

```typescript
const reviewResponseSchema = z.object({
  comments: z.array(
    z.object({
      path: z.string(),
      line: z.number(),
      body: z.string(),
      suggestion: z.string().optional(),
    })
  ),
  summary: z.string(),
});
```

Comments are mapped to the `ReviewComment` type before storage:

```typescript
type ReviewComment = {
  path: string;
  line: number;
  body: string;
  suggestion?: string;
  suggestedDiff?: { oldCode: string; newCode: string };
  status: "pending" | "applied" | "resolved";
  githubCommentId?: number;
};
```

## GitHub Token for Background Jobs

The webhook route does not pass the user's GitHub token in the Inngest event (tokens are short-lived and should not be persisted). Instead, the `processReview` function retrieves a fresh token at runtime:

- Use the Clerk Backend API: `clerkClient.users.getUserOauthAccessToken(clerkUserId, "github")`.
- This requires storing the user's `clerkId` (already in the `users` table) and looking it up from `userId`.
- The Clerk Backend API uses `CLERK_SECRET_KEY` (server-side only), so this works in background jobs without a request context.

## Error Handling

- **No API key:** Mark review `failed`, summary = "No API key configured. Add one in Settings."
- **GitHub API failure (diff fetch):** Inngest retries (3 attempts). After exhaustion, mark review `failed`.
- **LLM API failure:** Inngest retries. Common failures: invalid API key (mark `failed` immediately, no retry), rate limit (retry with backoff), model not found.
- **LLM returns invalid JSON:** Retry once. If still invalid, mark `failed` with summary = "LLM returned unparseable response."
- **GitHub comment posting fails:** Mark review `failed`. Comments are saved to DB regardless so the user can see them in the dashboard.
- **Vector indexing fails:** Log the error but don't fail the review. Indexing is best-effort and doesn't affect the user-facing result.

## Key Decisions

- **Vercel AI SDK `generateObject()`** over raw API calls — gives structured output with Zod validation across all providers, handles retries and streaming internally.
- **Single PR review** (not individual comments) — GitHub's "create review" API posts all comments atomically, avoiding notification spam.
- **Full file content + diff** sent to the LLM — the diff alone lacks context. The full file lets the LLM understand the surrounding code. Files over 100KB are skipped to stay within token limits.
- **Post-review indexing** — incremental indexing runs after the review is posted so it doesn't add latency to the review turnaround. If it fails, the review is still delivered.
- **GitHub suggestion syntax** — using GitHub's native suggestion blocks lets users apply fixes with one click directly from the PR UI, without needing our "Apply Fix" flow for simple changes.
- **Diff position mapping** — GitHub's review comment API requires a `position` (line offset within the diff hunk), not an absolute file line number. The mapper handles this translation.
- **OpenRouter via official SDK** — uses `@openrouter/ai-sdk-provider` for native Vercel AI SDK integration rather than shimming through the OpenAI provider.
