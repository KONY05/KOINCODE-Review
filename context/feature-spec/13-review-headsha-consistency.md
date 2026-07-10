# Feature 13: Review Head-SHA Consistency & Late-Cancellation Guard

## Overview

Fix a race condition in `processReview` where the diff/file list and the full file contents fed to the LLM can end up describing two different commits, producing corrupted or no-op "suggested change" comments. Close this by deriving a single canonical head SHA once, at the start of the review, and reusing it for every downstream fetch and write — and by re-checking cancellation immediately before posting, not just at the start of the job.

## Why

Discovered by manually testing the review agent against a real PR: several posted suggestions were either byte-identical to the existing code (no-op "fixes") or dropped the enclosing declaration line while picking up an unrelated trailing line — which would corrupt the file if applied (duplicated logic, orphaned `return`/braces).

Root cause, confirmed by tracing the pipeline:

- `fetchPRFiles(prNumber)` and `fetchPRDiff(prNumber)` (`lib/github/diff.ts`) take no commit SHA — they always return the PR's *current* state at call time.
- `fetchChangedFileContents(..., headSha)` (`lib/github/files.ts`) is pinned to `headSha`, which was captured from the webhook payload back when the job was enqueued (`app/api/webhooks/github/route.ts`).
- If a new commit lands on the PR after the webhook fires but before `run-review` finishes its fetches, the diff reflects the newer commit while the file contents reflect the older one. The LLM is told "use these line numbers from the full file contents" against a diff that no longer lines up — producing exactly the corruption observed.

This window is wide open in practice: `run-review` awaits GitHub fetches, vector context retrieval, and the LLM call itself (10–60s+), so a push landing anywhere in that ~15–70 second span triggers it. Feature 10 added an `isReviewStillActive` check, but it only runs **once**, before the fetches — it doesn't protect the LLM call or comment-posting that follow, so a supersession that happens mid-flight goes undetected.

Because reviews are BYOK (any user-supplied model), a corrupted or contradictory input context can make even a good model produce a bad suggestion — the fix belongs in the pipeline, not in prompt tuning.

## How It Works

`run-review` will resolve the PR's current head SHA itself, once, at the top of the step — instead of trusting the SHA carried in from the webhook event. That freshly-resolved SHA becomes the single source of truth for the diff, the file list, the file contents, and (later) the commit status and review submission. A second `isReviewStillActive` check runs immediately before `postReviewComments`, so a review superseded during the LLM call is discarded instead of posted.

## Implementation Plan

### 1. Resolve a canonical `reviewSha` at the start of `run-review` — `lib/inngest/functions.ts`

Immediately after the existing `isReviewStillActive` check (~line 374), fetch the PR's current head via `octokit.pulls.get` and use `data.head.sha` as `reviewSha` for the rest of the step. Replace the `headSha` from `event.data` with `reviewSha` everywhere inside `run-review` — the file-content fetch, the commit status update, and the arguments passed into `postReviewComments`.

`event.data.headSha` remains useful earlier in the function (e.g. the initial "pending" commit status set before `run-review` runs), but once `run-review` starts, `reviewSha` is authoritative.

### 2. Pass `reviewSha` through to file content fetch — `lib/inngest/functions.ts`

```ts
const fileContents = await fetchChangedFileContents(
  githubToken,
  owner,
  repoName,
  reviewableFiles,
  reviewSha, // was: headSha
);
```

Since `prFiles` and `diff` are fetched from the same live call that produced `reviewSha`, all three are now guaranteed to describe the same commit.

### 3. Re-check `isReviewStillActive` before posting — `lib/inngest/functions.ts`

Immediately before the call to `postReviewComments` (~line 507), re-run the existing `isReviewStillActive(reviewId)` check. If the review was superseded (new commit pushed, or PR closed) while the LLM call was in flight, skip posting and return `{ status: "cancelled" }` — mirroring the early-exit behavior Feature 10 already established for the pre-fetch check.

This closes the only part of the ~15–70s window that step 1–2 doesn't cover: a push landing *during* the LLM call itself doesn't corrupt anything (since `reviewSha` was already fixed for this run), but it does mean the review is now stale and shouldn't be posted at all — a fresh review for the new commit is already queued via the existing `synchronize` supersede path.

### 4. Reject no-op suggestions before posting — `lib/github/comments.ts`

In `postReviewComments`, before pushing a comment into `reviewComments`, compare `comment.suggestion` against the current lines `startLine..line` in the file (available via `patches`/`fileContents` already in scope). If the suggestion is identical (after trimming whitespace) to the code it claims to replace, drop the `suggestion` field from the comment body (keep the prose explanation, since that may still be valid) instead of posting a no-op "Apply suggestion" button.

This is a backstop, independent of the SHA fix — even a fully consistent diff/file-content pairing doesn't guarantee the model's suggested text is actually different from the original, and a no-op suggestion is confusing regardless of cause.

### 5. Reinforce line-range/suggestion constraints at the schema level — `lib/ai/review.ts`

Add `.describe()` to each field of the `comments` array in `reviewResponseSchema` so the constraints currently stated only in `REVIEW_SYSTEM_PROMPT` (`lib/ai/prompts.ts:96-108`) are also carried in the JSON schema/tool definition the model sees at generation time, for every field it fills in:

```ts
comments: z.array(
  z.object({
    path: z.string(),
    startLine: z
      .number()
      .optional()
      .describe(
        "First line of the problematic range. Omit for single-line issues. " +
          "Must point to the actual problematic code — never a surrounding " +
          "function/class/block declaration."
      ),
    line: z
      .number()
      .describe(
        "Last line of the problematic range (or the single line, if " +
          "startLine is omitted). Counted from the numbered Full File " +
          "Contents section."
      ),
    body: z.string().describe("Explanation of the issue. Be specific and actionable."),
    suggestion: z
      .string()
      .optional()
      .describe(
        "Complete replacement for lines startLine..line inclusive, and " +
          "nothing else. Must contain ONLY the corrected code — never the " +
          "original code, never both original and fixed, never lines " +
          "outside startLine..line. Empty string means delete the range " +
          "entirely. Omit if there's no code fix to suggest."
      ),
  })
),
```

Prose in a system prompt competes for attention with everything else in context (full file contents, diff, codebase context, repo memories); a description attached directly to the field the model is about to fill is read right at the point of decision, regardless of how far back the system prompt is or how strictly a given BYOK model weighs long-range instructions. This doesn't replace the system prompt rules — it's a second surface for the same constraint, on the theory that redundant reinforcement is cheap and failure here is expensive (a corrupted suggestion someone might actually click "Apply" on).

## Files Modified

| File | Change |
|------|--------|
| `lib/inngest/functions.ts` | `run-review` resolves `reviewSha` via a fresh `pulls.get` call at the top of the step; replaces `headSha` with `reviewSha` for file-content fetch, commit status, and `postReviewComments`. Adds a second `isReviewStillActive` check immediately before posting. |
| `lib/github/comments.ts` | `postReviewComments` drops the `suggestion` block (keeps prose body) when the suggested text is identical to the code it would replace. |
| `lib/ai/review.ts` | Adds `.describe()` to `startLine`, `line`, `body`, and `suggestion` on the `comments` schema, mirroring the existing system-prompt rules at the field level. |

## Key Decisions

- **Resolve one canonical SHA inside `run-review`, don't try to pin `fetchPRFiles`/`fetchPRDiff` to the old webhook SHA.** GitHub's `pulls.listFiles`/`pulls.get` diff endpoints aren't SHA-scoped — the only way to pin them would be switching to `repos.compareCommits(base, head)` (as `lib/github/adoption.ts` already does for adoption tracking) and threading a base SHA through the webhook payload too. Resolving fresh and using that everywhere is simpler and gives the same guarantee: internal consistency between diff, files, and content for this run.
- **Second cancellation check goes right before posting, not right before the LLM call.** The LLM call is the expensive, non-cancellable part — checking right before it saves nothing. Checking right before posting is what actually prevents a stale review from reaching the PR.
- **No-op suggestion guard drops the suggestion, not the whole comment.** The prose explanation may still be a valid observation even if the model failed to produce a real diff for it; removing just the broken "Apply suggestion" button avoids presenting a fix that does nothing while preserving any useful signal.
- **Schema-level reinforcement (`.describe()` on the Zod fields in `lib/ai/review.ts`) is in scope.** The SHA fix removes the corrupted-input root cause, but doesn't guarantee every BYOK model perfectly follows a rule stated once in a long system prompt. Field-level descriptions are a cheap second surface for the same constraints, applied at generation time rather than relying solely on prose read earlier in context.
