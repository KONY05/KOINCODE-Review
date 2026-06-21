# Feature 8: API Key Usage Logs

## Overview

Track every LLM and embedding API call made with a user's API key and surface the logs in a dedicated dashboard page. Each log entry records what action triggered the call, which model was used, token consumption (input + output), latency, and whether it succeeded or failed. Users can filter and browse their logs for cost tracking, debugging, and auditing.

## Why

With BYOK, users pay their own provider bills but have no visibility into what KOINCODE is doing with their key. Common questions this answers:

- "How many tokens did that review cost me?"
- "Why did my review fail?" → "Your key returned a 429 rate limit."
- "How often are embeddings running against my Google key?"
- "Which repo is consuming the most tokens?"

Without logs, users have to cross-reference their provider dashboard with KOINCODE's review history — painful and imprecise.

## Schema

### New table: `key_usage_logs`

| Column          | Type      | Default        | Notes                                                        |
|----------------|-----------|----------------|--------------------------------------------------------------|
| `id`           | uuid      | defaultRandom  | Primary key                                                  |
| `user_id`      | uuid      | —              | FK → `users.id`, ON DELETE CASCADE                           |
| `api_key_id`   | uuid      | —              | FK → `api_keys.id`, ON DELETE SET NULL (keep logs if key deleted) |
| `repo_id`      | uuid      | null           | FK → `repos.id`, ON DELETE SET NULL (null for non-repo actions) |
| `review_id`    | uuid      | null           | FK → `reviews.id`, ON DELETE SET NULL (null for non-review actions) |
| `action`       | text      | —              | One of: `review`, `embedding`, `memory_extraction`           |
| `provider`     | text      | —              | `anthropic`, `openai`, `google`, `openrouter`                |
| `model`        | text      | —              | Model string used (e.g., `claude-sonnet-4-20250514`)    |
| `input_tokens` | integer   | 0              | Prompt / input tokens consumed                               |
| `output_tokens`| integer   | 0              | Completion / output tokens consumed                          |
| `duration_ms`  | integer   | 0              | Wall-clock time of the API call in milliseconds              |
| `status`       | text      | —              | `success` or `failed`                                        |
| `error`        | text      | null           | Error message on failure (redacted — no keys or secrets)     |
| `created_at`   | timestamp | now()          | When the call was made                                       |

## Where Logs Are Recorded

Each log is inserted **after** the API call completes (success or failure), inside the Inngest step that made the call. The Vercel AI SDK returns token usage on the result object.

### 1. Review LLM call — `lib/ai/review.ts`

`runReview()` returns the `generateText` result which includes `result.usage` (`{ promptTokens, completionTokens }`). The caller in `lib/inngest/functions.ts` (`run-llm-review` step) inserts the log after the call.

```typescript
// After runReview() in the "run-llm-review" step:
await db.insert(keyUsageLogs).values({
  userId,
  apiKeyId,
  repoId,
  reviewId,
  action: "review",
  provider: config.provider,
  model: config.model,
  inputTokens: usage.promptTokens,
  outputTokens: usage.completionTokens,
  durationMs,
  status: "success",
});
```

### 2. Embedding calls — `lib/vector/embeddings.ts`

`generateEmbeddings()` uses `embedMany()` from the AI SDK which returns `usage`. The callers in `lib/inngest/functions.ts` (`index-repo` and `index-changed-files` steps) insert the log.

### 3. Memory extraction — `lib/ai/memory.ts` (Feature 07)

When the `process-comment-reply` function calls the LLM to extract a rule, it logs the call.

## Changes to `runReview()`

`runReview()` currently returns just the parsed `ReviewResponse`. It needs to also return usage and timing data so the caller can log it.

```typescript
type ReviewResult = {
  response: ReviewResponse;
  usage: { promptTokens: number; completionTokens: number };
  durationMs: number;
};
```

## Files Created

| File | Purpose |
|------|---------|
| `lib/db/schema/key-usage-logs.ts` | Drizzle schema for `key_usage_logs` table |
| `app/(dashboard)/logs/page.tsx` | Logs page — server component, fetches and displays logs |
| `components/logs-table.tsx` | Client component for the filterable/paginated logs table |

## Files Modified

| File | Change |
|------|--------|
| `lib/db/schema/index.ts` | Export `keyUsageLogs` |
| `lib/ai/review.ts` | Return usage and duration alongside the response |
| `lib/vector/embeddings.ts` | Return usage from `embedMany()` |
| `lib/inngest/functions.ts` | Insert log rows after each LLM/embedding call |
| `app/(dashboard)/layout.tsx` | Add "Logs" nav item to the sidebar |

## UI: Logs Page

### Route: `/logs`

A table view with:

| Column | Source |
|--------|--------|
| Timestamp | `created_at` |
| Action | `action` — badge: Review, Embedding, Memory |
| Repo | `repo_id` → `repos.fullName` |
| Model | `model` |
| Tokens | `input_tokens + output_tokens` (with breakdown on hover) |
| Duration | `duration_ms` formatted as seconds |
| Status | `status` — green dot for success, red for failed |

### Filters

- **Action** — dropdown: All, Review, Embedding, Memory Extraction
- **Status** — dropdown: All, Success, Failed
- **Repo** — dropdown of connected repos
- **Date range** — last 7 / 30 / 90 days

### Pagination

Server-side cursor pagination (keyset on `created_at` DESC, `id` DESC). 25 rows per page.

### Summary cards (top of page)

- **Total Calls** — count of logs in the filtered range
- **Total Tokens** — sum of `input_tokens + output_tokens`
- **Success Rate** — percentage of `status = 'success'`
- **Avg Duration** — average `duration_ms`

## Error Handling

- **Log insertion fails:** Swallow the error and log to console. Never let logging failure break the review pipeline.
- **Token usage unavailable:** Some providers/errors may not return usage. Default to 0 for both fields.
- **Key deleted:** Logs persist with `api_key_id = NULL` (ON DELETE SET NULL). The provider and model fields on the log row itself are sufficient for historical context.

## Key Decisions

- **Flat log table, not time-series** — At the expected scale (tens to hundreds of calls per user per day), Postgres handles this fine. No need for a dedicated analytics DB or time-series store.
- **Log after the call, not before** — We want actual token counts and duration, not estimates. If the process crashes mid-call, we lose the log, but that's acceptable since we also lose the review.
- **Denormalized `provider` and `model`** — Stored on each log row rather than joining through `api_keys`. This keeps logs meaningful after key rotation or deletion.
- **No cost calculation** — Provider pricing changes frequently and varies by plan (pay-as-you-go vs. committed). Showing raw token counts lets users calculate cost against their own pricing. Adding a cost column later is additive.
- **ON DELETE SET NULL for foreign keys** — Logs are audit records. Deleting a key, repo, or review shouldn't erase the usage history.
