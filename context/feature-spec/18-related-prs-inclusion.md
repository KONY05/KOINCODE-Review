# Feature 18: Possibly Related PRs

## Overview

Prompted by watching a CodeRabbit review in a tutorial video: CodeRabbit adds a "Possibly related PRs" section to its review, listing other pull requests that touched the same code, each with a one-line reason ("Modifies another function in `src/inngest/functions.ts` to use an AI agent...", "Introduces the original `helloWorld` function... which this PR updates").

This document scopes a **same-repo, heuristic** version: find past PRs in the same repository that touched files this PR also touches, surfaced as a new section in the review comment body. It does not attempt CodeRabbit's cross-repo matching (the screenshot shows related PRs from a *different* repo under the same GitHub org — that requires indexing across all of a user's connected repos, a much bigger feature) or an LLM-authored relation description (CodeRabbit's phrasing implies it diffed the two PRs' content; this version uses a file-overlap heuristic instead, to avoid a second LLM call — and therefore extra cost/latency — per review).

## Current State (confirmed by reading the code)

- `processReview` (`lib/inngest/functions.ts:249`) already fetches `prFiles` inside the `run-review` step (`:387`) and derives `reviewableFiles` (`:392-394`, added/modified files, lockfiles already excluded by `shouldSkipFile` in `lib/github/diff.ts:11-21`) — this is the right file list to match against, already computed, no new fetch needed for that part.
- Nothing in the codebase currently queries GitHub for a file's commit/PR history — `lib/github/diff.ts` only fetches the current PR's own files/diff/head SHA.
- `ReviewSummary` (`lib/github/comments.ts:16-20`) is the type `buildReviewBody()` renders into the top-level review comment: `{ summary, walkthrough, diagram? }`. `postReviewComments()` (`:210-301`) builds this object at its call site in `functions.ts:576-582` from `reviewData.response` (the LLM's structured output) — the LLM does not currently produce anything related-PR-shaped, and per the "no LLM call" decision above, it shouldn't need to.
- `reviews` (`lib/db/schema/reviews.ts:37-54`) has no column that would fit this — `comments` is specifically `ReviewComment[]` (inline diff comments), `summary` is free text. Consistent with `walkthrough`/`diagram` today (also not persisted beyond the GitHub comment itself), related PRs shouldn't need a new column either — see Design.

## Design

### 1. Fetching candidate PRs — `lib/github/related-prs.ts` (new)

```ts
export type RelatedPR = {
  number: number;
  title: string;
  url: string;
  reason: string;
};

export async function fetchRelatedPRs(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  baseBranch: string,
  changedFiles: string[]
): Promise<RelatedPR[]>
```

For up to the first **5** entries in `changedFiles` (bounds the request count on PRs touching many files — see Rate Limiting below):

1. `octokit.repos.listCommits({ owner, repo, path: file, sha: baseBranch, per_page: 3 })` — commit history for that file, walked from `baseBranch` (not the PR's head). Anchoring on `baseBranch` rather than the default branch matters for PRs opened against a release/long-lived branch, and it naturally excludes the current PR's own unmerged commits (they aren't reachable from `baseBranch` yet).
2. For each commit returned, `octokit.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha })` to resolve it to a PR. **Filter the result to `merged_at != null`.** The endpoint associates by "was this commit SHA ever in this PR's branch," not "this PR is why the commit is in `baseBranch`" — it can return still-open PRs (same SHA appearing in an unrelated later branch) or closed-unmerged PRs (commit landed via a different path, e.g. rebase/cherry-pick, while the original PR was abandoned) alongside the one that actually merged it. `merged_at` is present on the response objects (same simplified PR shape GitHub returns elsewhere) so this filter is free — no extra API call.
3. Collect `{ number, title, url: html_url, files: Set<matched changedFiles> }` from the merged-only results, deduping by PR number and excluding `prNumber` itself (a currently-open PR can't yet be an ancestor of its own base branch, but excluding by number is a cheap belt-and-suspenders check).

After collecting across all sampled files: sort by number of matched files descending (ties broken by most recent), take the top **3**, and build `reason` as:

```ts
function buildReason(files: string[]): string {
  const list = files.map((f) => `\`${f}\``).join(", ");
  return `Also modifies ${list}, which this PR changes.`;
}
```

### 2. Wiring into the review pipeline

New step in `processReview`, after `run-review` and before `update-pr-description` (`functions.ts:552`) — it doesn't depend on the LLM's output and doesn't block it, but it does need `reviewData.reviewedFiles` (already returned from `run-review`, `:515`) and `reviewData.reviewSha`/`baseBranch` (already in scope):

```ts
const relatedPRs = await step.run("find-related-prs", async () => {
  try {
    return await fetchRelatedPRs(
      githubToken,
      owner,
      repoName,
      prNumber,
      baseBranch,
      reviewData.reviewedFiles
    );
  } catch (error) {
    console.error("Failed to fetch related PRs:", error);
    return [];
  }
});
```

Non-fatal by the same pattern as `codebaseContext` (`:431-460`) and `update-pr-description` (`:552-564`) — a GitHub API hiccup here should never fail the review.

`ReviewSummary` (`lib/github/comments.ts:16-20`) gains an optional field:

```ts
type ReviewSummary = {
  summary: string;
  walkthrough: { path: string; change: string }[];
  diagram?: string;
  relatedPRs?: RelatedPR[]; // new
};
```

`functions.ts:576-582`'s `postReviewComments()` call site adds `relatedPRs` to the object it already builds from `reviewData.response` + passes `relatedPRs` (the new step's result) alongside.

### 3. Rendering — `buildReviewBody()` (`lib/github/comments.ts:27-61`)

New section inserted after the Sequence Diagram block (`:46-50`) and before the inline-comment-count footer (`:52-58`), matching the screenshot's ordering (Walkthrough → Sequence Diagram → Possibly Related PRs):

```ts
if (reviewSummary.relatedPRs && reviewSummary.relatedPRs.length > 0) {
  const lines = reviewSummary.relatedPRs.map(
    (pr) => `- [#${pr.number}](${pr.url}): ${pr.reason}`
  );
  sections.push(`### Possibly Related PRs\n\n${lines.join("\n")}`);
}
```

Omitted entirely (not an empty heading) when no related PRs are found — same convention as `diagram`.

## Schema/Type Changes Needed

- `lib/github/related-prs.ts` (new file) — `RelatedPR` type, `fetchRelatedPRs()`.
- `ReviewSummary.relatedPRs?: RelatedPR[]` (`lib/github/comments.ts`).
- No database schema changes — not persisted, same as `walkthrough`/`diagram` today. If a future feature wants related PRs shown in the dashboard (`ReviewItem.tsx`), that's a separate decision to add a `reviews.relatedPrs` jsonb column; out of scope here per the "don't add abstractions until there's a second consumer" rule in `ai-workflow-rules.md`.

## Rate Limiting / Cost

Worst case per review: 5 files × (1 `listCommits` + up to 3 `listPullRequestsAssociatedWithCommit`) = 20 GitHub API calls. Uses the same PAT/installation token already used for the rest of the review (`githubToken`, fetched once in `get-github-token`, `functions.ts:282`) — no new auth surface. At GitHub's 5,000 req/hr authenticated limit this is a rounding error next to the rest of the pipeline (file content fetches, diff, comment posting), but if `reviewableFiles` is large the 5-file cap keeps it bounded regardless of PR size.

## Explicitly Out of Scope

Both confirmed as permanent scope boundaries for this feature, not open questions to revisit:

- **Cross-repo related PRs** (the screenshot's actual example) — would require searching across all of a user's *other* connected repos, not just the one being reviewed. Same-repo only, full stop; not a v1-vs-later phasing decision.
- **LLM-authored relation description** — CodeRabbit's phrasing reads like it diffed the two PRs' actual content ("Modifies another function... to use an AI agent"). This feature uses the static file-overlap heuristic from `buildReason()` (Design §1) instead, and stays that way — no second LLM call, no folding related-PR context into the review prompt.
