# Feature 16: Prior-Review Context on Synchronize Re-Reviews

## Overview

When a `synchronize` webhook (new commits pushed to an open PR) triggers a re-review, pass the previous completed review's summary and inline comments (with adoption status) into the LLM prompt. This gives the model continuity across review rounds on the same PR instead of reviewing each commit in total isolation.

## Why

Observed manually: a PR received a first review flagging a performance issue (`getAllCommands()` recomputed on every filter call) and suggesting a fix — either pass `allCommands` as a prop, or "load skills once and memoize the result." That suggestion was not applied as given. The `synchronize`-triggered second review then presented, as its starting point, a version of the file with a caching mechanism already in place — and "fixed" a double-call inefficiency within that caching code. It did not surface a new, distinct issue: the caching mechanism itself is the same idea the first review already floated (memoize/cache the combined command list), just re-derived and framed as if it were newly-discovered code rather than a callback to what it already suggested. Without seeing its own prior review, the model has no way to recognize it's circling back to the same fix a second time instead of reviewing what's actually new.

Traced the pipeline (`lib/ai/prompts.ts`, `lib/ai/review.ts`, `lib/inngest/functions.ts`) and confirmed the root cause: `processReview` is completely stateless per run. `buildReviewPrompt()` only ever receives the current diff, current full file contents, codebase context, and repo memories — never anything about a prior review of the same PR. `opened` and `synchronize` go through the identical code path (`lib/inngest/functions.ts:245-652`), so a re-review has no way to know:
- what was already flagged
- whether a flagged issue was adopted (fixed) or is still pending
- what direction a previous suggestion pushed the code in

Each review round is an independent opinion rather than a continuation, which surfaces as reviews that feel contradictory or lower-quality on later commits — not because the model got worse, but because it's re-deriving everything from scratch every time.

## How It Works

Before calling `runReview()`, `processReview` looks up the most recently **completed** review for the same `(repoId, prNumber)` — this covers both `opened`→`synchronize` and `synchronize`→`synchronize` cases, since the first review on a PR simply won't find one. If found, its summary and comments (each comment's `pending`/`adopted` status is already tracked by Feature 12's adoption detection) are passed into `buildReviewPrompt()` as a new "Previous Review" section, with explicit instructions: don't re-flag adopted issues, only re-raise a pending issue if it's still genuinely present, and stay consistent with the previous review's direction unless it's now clearly wrong given the new code.

Only the single most recent completed review is used, not full history — bounds prompt growth on PRs with many commits, and the adoption-status field already summarizes what happened to earlier rounds (an issue adopted two reviews ago is just gone from the comments array's `pending` set by the time it'd otherwise resurface... actually it stays in that older review's `comments`, but since only the latest review is consulted, this is a non-issue — see Key Decisions).

No schema changes needed — `reviews` rows are already scoped by `(repoId, prNumber)` with a `status` and `createdAt`, which is enough to find "the last one."

## Implementation Plan

### 1. Fetch the previous completed review — `lib/inngest/functions.ts`

Inside the `run-review` step (~line 379), alongside the existing `Promise.all` for `prFiles`/`diff`/`reviewSha` (lines 382-386), add a query for the prior review:

```ts
const [previousReview] = await db
  .select({ summary: reviews.summary, comments: reviews.comments })
  .from(reviews)
  .where(
    and(
      eq(reviews.repoId, repoId),
      eq(reviews.prNumber, prNumber),
      eq(reviews.status, "completed")
    )
  )
  .orderBy(desc(reviews.createdAt))
  .limit(1);
```

Run this alongside the existing `Promise.all` (or as a separate `db.select` — it's a single indexed-ish lookup, not worth blocking the GitHub fetches on). Guard for `undefined` (no prior review — the common `opened` case).

### 2. Extend `RunReviewParams` and `PromptParams` — `lib/ai/review.ts`, `lib/ai/prompts.ts`

Add an optional field to both:

```ts
previousReview?: {
  summary: string;
  comments: { path: string; line: number; body: string; status: "pending" | "adopted" }[];
};
```

Pass it straight through in `runReview()` (`lib/ai/review.ts:69-78`) the same way `repoMemories` is passed today.

### 3. Add a "Previous Review" section to the prompt — `lib/ai/prompts.ts`

In `buildReviewPrompt()`, insert a new section after "Repository Rules" (~line 127) and before "Codebase Context":

```ts
if (params.previousReview) {
  const { summary, comments } = params.previousReview;
  const pending = comments.filter((c) => c.status === "pending");
  const adopted = comments.filter((c) => c.status === "adopted");

  sections.push(
    `## Previous Review\n\n` +
      `This PR was already reviewed. Here is what the last review found, before this new commit:\n\n` +
      `**Previous summary:** ${summary}\n\n` +
      (adopted.length > 0
        ? `**Already fixed (do not re-flag these):**\n` +
          adopted.map((c) => `- ${c.path}:${c.line} — ${c.body}`).join("\n") +
          `\n\n`
        : "") +
      (pending.length > 0
        ? `**Still open as of the last review (verify against the current diff — only re-flag if genuinely still present):**\n` +
          pending.map((c) => `- ${c.path}:${c.line} — ${c.body}`).join("\n")
        : "") +
      `\n\nGround every finding in the current "Full File Contents" and "Diff" sections below, not in what this previous review suggested. If a pending item above isn't actually present in the code as it exists now, don't restate it or "fix" it — that means it was never applied, not that a related-looking fix is due. Don't re-propose the same idea from a pending item under a different name or framing; if a previously suggested fix wasn't applied, say so plainly rather than re-deriving it as if it were a new finding.`
  );
}
```

### 4. Reinforce the rule in the system prompt — `lib/ai/prompts.ts`

Add one line to `REVIEW_SYSTEM_PROMPT` near the existing "Rules for inline comments" (~line 89-94):

```
- If a "Previous Review" section is present: don't repeat issues marked already fixed, don't re-raise a still-open issue unless it's genuinely present in the current "Full File Contents"/"Diff", and never re-derive a previously suggested fix as if it were a newly-discovered issue in the current code — treat the previous review as history to build on, not as ground truth about what the code currently looks like.
```

## Files Modified

| File | Change |
|------|--------|
| `lib/inngest/functions.ts` | `run-review` step queries the most recent `completed` review for `(repoId, prNumber)` and passes its summary + comments into `runReview()`. |
| `lib/ai/review.ts` | `RunReviewParams` gains optional `previousReview`; passed through to `buildReviewPrompt()`. |
| `lib/ai/prompts.ts` | `PromptParams` gains optional `previousReview`; `buildReviewPrompt()` renders a "Previous Review" section (summary + adopted/pending comments) when present. `REVIEW_SYSTEM_PROMPT` gets one added rule about respecting it. |

## Key Decisions

- **Only the single most recent completed review, not full history.** Bounds prompt size regardless of how many commits a PR accumulates. A concern: if review N-2 flagged something still pending and review N-1 (for whatever reason — e.g. the touched lines weren't near the new push's diff) didn't re-surface it, that issue's `pending` status only lives in review N-2's row, which this feature won't look at. Accepted as a real but minor gap — adoption detection (Feature 12) already re-checks all `completed` reviews with pending comments against every push, independent of this feature, so a genuinely fixed old issue still gets marked `adopted` even though this feature only reads the latest review's comments for prompt-building purposes.
- **No new `priorReviewId`/`reviewRound` schema field.** Reviews are already queryable by `(repoId, prNumber, status, createdAt)`, which is sufficient to find "the last one." Adding a link column would only matter if we needed to walk the full chain, which the scoping decision above avoids.
- **Reuses existing `pending`/`adopted` comment status, doesn't add a third state.** No new field for "explicitly dismissed via GitHub UI" — the codebase has no signal for that today (GitHub's suggestion "Apply"/dismiss actions aren't distinguished from a comment just sitting unresolved), so `pending` already means "not detected as adopted," which is the correct default to re-surface for verification rather than silently drop.
- **Previous-review lookup happens inside the `run-review` step, not as a separate Inngest step.** It's a single fast DB query, not worth its own step/retry boundary — consistent with how `memories` (repo rules) is already fetched inline in the same step (`lib/inngest/functions.ts:400-408`).
