# Feature 9: GitHub Check Runs for Review Status

## Overview

When a PR review is triggered, create a GitHub Check Run on the PR's head commit that shows a pending spinner while the review is in progress. Update it to success or failure when the review completes. This gives immediate visual feedback on the PR — the same pattern CodeRabbit, SonarCloud, and other CI tools use.

## Why

Currently, there's no visible indicator on the PR that a review is happening. The user opens a PR, the webhook fires, the Inngest job starts, and the review silently appears as comments minutes later. The gap between PR creation and review delivery feels like nothing happened — users might push additional commits, close the PR, or think the tool isn't working.

A Check Run solves this by showing a yellow spinner in the PR's checks section immediately, with a status update when the review lands.

## How GitHub Check Runs Work

Check Runs are part of the GitHub Checks API. They attach to a specific commit SHA and show up in:
- The PR's "Checks" tab (yellow spinner → green check / red X).
- The merge box at the bottom of the PR (alongside CI status).
- The commit status indicator on the branch.

They require a GitHub App or an OAuth token with the `checks:write` scope. Since we use Clerk's GitHub OAuth, we need to verify the token has this scope (or request it via Clerk's OAuth config).

## Implementation Plan

### 1. Check Run helpers — `lib/github/checks.ts`

Create two functions using Octokit:

- `createCheckRun(token, owner, repo, headSha)` — creates a Check Run with:
  - `name`: `"KoinCode Review"`
  - `head_sha`: the PR's head commit SHA
  - `status`: `"in_progress"`
  - `started_at`: current ISO timestamp
  - `output.title`: `"Review in progress"`
  - `output.summary`: `"Analyzing your pull request..."`
  - Returns the `check_run_id`.

- `completeCheckRun(token, owner, repo, checkRunId, result)` — updates the Check Run with:
  - `status`: `"completed"`
  - `conclusion`: `"success"` | `"failure"` | `"neutral"`
  - `completed_at`: current ISO timestamp
  - `output.title`: result-dependent (e.g., `"Found 3 issues"`, `"Review complete — no issues"`, `"Review failed"`)
  - `output.summary`: a brief markdown summary of findings or the failure reason.

Both functions use `POST /repos/{owner}/{repo}/check-runs` and `PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}`.

### 2. Integrate into the review pipeline — `lib/inngest/functions.ts`

Add two new steps to the `processReview` Inngest function:

**Step: `create-check-run`** — runs immediately after `get-github-token`, before `fetch-diff`:
```
Creates the Check Run → returns checkRunId.
```

**Step: `complete-check-run`** — runs at the very end of the pipeline (after `save-review` and `index-changed-files`), or in the error handler:
- On success: conclusion = `"success"`, title = summary from the LLM review, summary = walkthrough or comment count.
- On failure: conclusion = `"failure"`, title = `"Review failed"`, summary = the error reason.
- On no issues found: conclusion = `"neutral"`, title = `"No issues found"`.

**Error handling integration:** Wrap the main pipeline in a try/catch at the function level so `complete-check-run` always fires, even on unrecoverable errors. The Check Run should never be left stuck in `in_progress`.

### 3. Handle the no-API-key early exit

The current flow returns early when no API key is configured, before the GitHub token is fetched. Since we need the token to create the Check Run, restructure the early exit:

- Move the GitHub token fetch before the API key check.
- If no API key: create a Check Run, immediately complete it with `conclusion: "failure"` and summary = `"No API key configured. Add one in Settings."`, then return.

### 4. OAuth scope — `checks:write`

The GitHub OAuth integration via Clerk must request the `checks:write` scope. This is configured in the Clerk Dashboard under the GitHub OAuth provider settings. Add `checks:write` to the requested scopes.

No code change — this is a Clerk Dashboard configuration step. Document it in the env/setup section.

## Check Run Output Detail

### Success (issues found)
```
title: "Found 3 issues"
summary: |
  **KoinCode** reviewed this PR and found 3 issues.

  - 1 bug
  - 1 security concern  
  - 1 performance suggestion

  See the inline comments below for details.
```

### Success (no issues)
```
title: "No issues found"
summary: |
  **KoinCode** reviewed this PR and found no issues. Looks good!
```

### Failure
```
title: "Review failed"
summary: |
  **KoinCode** could not complete the review.

  Reason: {error message}
```

### No API key
```
title: "Review skipped — no API key"
summary: |
  **KoinCode** could not review this PR because no API key is configured.

  Add one in [Settings]({app_url}/dashboard/settings).
```

## Files Created

| File | Purpose |
|------|---------|
| `lib/github/checks.ts` | Create and complete GitHub Check Runs |

## Files Modified

| File | Change |
|------|--------|
| `lib/inngest/functions.ts` | Add `create-check-run` and `complete-check-run` steps to `processReview`, restructure early exit for no-API-key case |

## Pipeline Step Order (updated)

1. `load-config` — fetch user, API key, Google key
2. `get-github-token` — fetch OAuth token from Clerk (moved before API key check)
3. `create-check-run` — **new** — create in-progress Check Run on head SHA
4. *(early exit if no API key — complete check run with failure, return)*
5. `set-in-progress` — update review status in DB
6. `fetch-diff` — get PR diff and file list
7. `fetch-file-contents` — get full content of changed files
8. `load-repo-memories` — fetch active repo memory rules
9. `retrieve-context` — query Pinecone for relevant codebase context
10. `run-llm-review` — call the user's LLM
11. `post-comments` — post review comments to GitHub PR
12. `save-review` — persist review results to DB
13. `index-changed-files` — incrementally index changed files
14. `complete-check-run` — **new** — update Check Run to success/failure

## Key Decisions

- **Check Runs over Commit Statuses** — Check Runs support rich output (title, summary, markdown, annotations), show up in a dedicated PR tab, and can be updated in-place. Commit Statuses are simpler but only show a one-line description and a link.
- **Always complete the Check Run** — a stuck "in progress" check is worse than no check at all. The pipeline wraps the critical path in try/catch to ensure the check is always completed, even on unexpected failures.
- **Neutral conclusion for zero issues** — `"success"` with zero issues could be confused with "passed a quality gate." `"neutral"` is semantically correct: the check ran, found nothing actionable, and isn't blocking.
- **No branch protection enforcement** — we set the Check Run but don't recommend users make it a required check. The review is informational, not a gate. Users can optionally configure this in their repo settings if they want.
- **`checks:write` scope** — this is the only additional OAuth scope needed. It's added in the Clerk Dashboard, not in code. Existing users may need to re-authorize if Clerk doesn't silently upgrade scopes.
