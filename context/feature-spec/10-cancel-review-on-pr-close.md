# Feature 10: Cancel In-Flight Reviews When PR Is Closed or Merged

## Overview

When a pull request is closed or merged while a review is still in progress, cancel the review immediately. Posting review comments on an already-merged or closed PR is noise — the code has either shipped or been abandoned.

## Why

The review pipeline takes 10–30 seconds. During that window the author can merge the PR (fast-forward, auto-merge, or another reviewer approves). Without cancellation:
- Review comments land on a merged PR — confusing and not actionable.
- The commit status is set to "success" or "failure" on a commit that's already in `main`.
- Embedding indexing runs unnecessarily.
- LLM tokens and API quota are wasted on a review nobody will read.

## How It Works

GitHub sends a `pull_request` webhook with `action: "closed"` when a PR is either merged or manually closed. The `merged` boolean on the payload distinguishes the two, but for cancellation purposes we treat both the same — the review is no longer needed.

## Implementation Plan

### 1. Handle `closed` action in the webhook — `app/api/webhooks/github/route.ts`

Expand `handlePullRequest` to handle the `closed` action:

- Look up any reviews for this PR that are `pending` or `in_progress`.
- Update their status to `failed` with summary `"Review cancelled — PR was closed."` (or `"PR was merged."`).
- Send an Inngest event `pr/review-cancelled` with the `reviewId`, `repoFullName`, `headSha`, and `userId` so the pipeline can clean up (set commit status).

No review row is created for `closed` events — we only update existing in-flight reviews.

### 2. Add a cancellation function — `lib/inngest/functions.ts`

Create a new Inngest function `cancelReview` triggered by `pr/review-cancelled`:

- Fetch the GitHub token via Clerk.
- Set the commit status to `neutral` with description `"Review cancelled — PR closed"`.
- No retries needed — if it fails, the stale pending status will eventually be ignored.

### 3. Add early-exit checks to `processReview` — `lib/inngest/functions.ts`

Before the expensive steps (`run-review`, `post-comments`), check if the review status is still `in_progress`. If it's been changed to `failed` (by the cancellation webhook), bail out early:

- Add a helper `isReviewStillActive(reviewId)` that queries the review status.
- Call it before `run-review` (the most expensive step — LLM call).
- If cancelled, return `{ status: "cancelled" }` without posting comments or setting commit status.

The check goes **before** the LLM call because that's where the cost is. Steps before it (fetching diff, file contents) are cheap and fast, so checking earlier isn't worth the extra DB query.

### 4. Handle `synchronize` with an in-flight review

When a PR receives a new push (`synchronize` action) while a review is already running for a previous commit:

- The webhook already creates a new review row and dispatches a new `pr/review-requested` event.
- Mark any existing `pending` or `in_progress` reviews for the same PR as `failed` with summary `"Superseded by newer commit."`.
- This prevents the old review from posting stale comments after the new one starts.

## Webhook Payload Reference

```json
{
  "action": "closed",
  "number": 42,
  "pull_request": {
    "merged": true,
    "head": { "sha": "abc123", "ref": "feature-branch" },
    "base": { "ref": "main" }
  },
  "repository": {
    "id": 12345,
    "full_name": "owner/repo"
  }
}
```

## Pipeline Behavior by Scenario

| Scenario | What happens |
|----------|-------------|
| PR closed/merged, review is `pending` | Status → `failed`, summary set, `pr/review-cancelled` dispatched |
| PR closed/merged, review is `in_progress` | Status → `failed`, summary set, `pr/review-cancelled` dispatched. `processReview` bails at next check. |
| PR closed/merged, review already `completed` | No action — review already posted. |
| New push while review is running | Old review marked `failed` ("Superseded"), new review starts. |

## Files Modified

| File | Change |
|------|--------|
| `app/api/webhooks/github/route.ts` | Handle `closed` action: cancel in-flight reviews, dispatch `pr/review-cancelled`. Handle `synchronize`: supersede old reviews. |
| `lib/inngest/functions.ts` | Add `cancelReview` function. Add `isReviewStillActive` check before `run-review` step in `processReview`. |
| `app/api/inngest/route.ts` | Register `cancelReview` function. |

## Key Decisions

- **Cancel on both merge and close** — a closed-without-merge PR is abandoned. A merged PR has shipped. Neither needs a review landing after the fact.
- **Check before LLM, not before every step** — the LLM call is 90%+ of the cost and duration. Checking before cheap steps (DB reads, GitHub API reads) adds latency for no real savings.
- **Supersede on `synchronize`** — prevents two reviews from racing and posting duplicate or conflicting comments on the same PR.
- **Use `neutral` commit status for cancelled reviews** — `failure` implies something broke. `neutral` correctly signals "didn't run" without alarming the user.
- **No cancellation of the Inngest function itself** — Inngest doesn't support mid-execution cancellation. Instead, the function checks DB state and exits early. This is simpler and more reliable than trying to coordinate cancellation signals.
