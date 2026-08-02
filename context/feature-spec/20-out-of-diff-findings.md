# Feature 20: Surface Out-of-Diff Findings

## Overview

The review model is explicitly instructed to flag pre-existing problems in the code surrounding a change ("Surrounding code risks", `lib/ai/prompts.ts:110-111`). Those findings are then **silently discarded**, because a pre-existing issue by definition lives outside the diff hunks, and `postReviewComments` drops any comment whose line can't be mapped into the patch.

Observed live on `KONY05/todo-app-testing#20`: the model returned 3 comments — a React key collision (`key={todo.text}`), an XSS via `dangerouslySetInnerHTML` on user-controlled text, and missing date validation in `formatDueDate`. All three are real. All three were dropped, because the PR's patch covers only new-file lines ~2-8, 50-59, 112-118, 124-133 and 309-317 of a ~340-line file, and every finding sat in the gaps. The PR showed "✅ No issues found."

This feature routes those findings into a section of the review body instead of dropping them.

## Current State (confirmed by reading the code)

- `postReviewComments` (`lib/github/comments.ts`) filters before posting: `if (!patch) continue` (`:266`) and `if (!position) continue` (`:269`). The dropped comment is not recorded anywhere — the only trace is the arithmetic gap between the model's comment count and `submittedCount`.
- The drop loop runs **before** `buildReviewBody` is called (`:306`), so the set of unpostable comments is already known at body-render time. No extra pass or plumbing through the Inngest pipeline is needed.
- `buildReviewBody` (`:49`) currently takes `(reviewSummary, commentCount)` and renders summary → walkthrough → diagram → related PRs → footer.
- Feature 13's `isNoOpSuggestion` already establishes the precedent that a comment can be posted with its prose intact but its suggestion stripped — degrading an unusable affordance rather than dropping the finding. This feature applies the same principle one level up.
- `save-review` (`lib/inngest/functions.ts`) persists **all** model comments to `reviews.comments`, mapped or not — dropped ones simply have no `githubCommentId`. So out-of-diff findings are already in the database and already counted on the dashboard; only the GitHub surface loses them.

## Design

### 1. `scope` on each comment

`reviewResponseSchema` (`lib/ai/review.ts`) gains a discriminator:

```ts
scope: z
  .enum(["diff", "surrounding"])
  .describe(
    "\"diff\" if the issue is on a line this PR changed. \"surrounding\" if it is pre-existing code the change interacts with but does not itself modify."
  ),
```

Without this, a deliberate surrounding-code finding and a hallucinated line number are indistinguishable — both simply fail to map. Routing every mapping failure into the body would trade silent loss for visible noise, and noise in a review tool is what teaches people to stop reading it.

Routing table:

| | maps into diff | does not map |
|---|---|---|
| `scope: "diff"` | inline comment (today's behaviour) | **dropped** — the model got the line wrong |
| `scope: "surrounding"` | inline comment (it happens to be in range) | **body section** |

Note the model's `scope` claim is only ever used to decide what to do on failure — it never overrides a successful mapping. A finding that maps is always posted inline regardless of what the model called it.

### 2. Collect in the drop loop

The two `continue` sites at `:266`/`:269` gain a collection step before skipping:

```ts
const outOfDiff: OutOfDiffFinding[] = [];
// ...
if (!position) {
  if (comment.scope === "surrounding") {
    outOfDiff.push({ path: comment.path, line: comment.line, body: comment.body, suggestion: comment.suggestion });
  }
  continue;
}
```

Capped at `MAX_OUT_OF_DIFF = 5`, ordered as the model returned them. The cap matters because of the re-review problem below, not because 6 findings would be too long to render.

### 3. Render

`buildReviewBody` takes a third argument and renders a new section after Possibly Related PRs, before the footer:

```markdown
### Outside This Diff

Pre-existing issues in the files this PR touches. No inline comments — these
lines aren't part of the change, so GitHub can't anchor to them.

**`src/App.tsx:259`** — `key={todo.text}` collides when two todos share text, so
React reuses the wrong DOM node on reorder.

```diff
-key={todo.text}
+key={todo.id}
```

A `diff` fence rather than a `suggestion` fence, deliberately: a `suggestion` block outside an inline comment renders as an inert code box with no Apply button, which looks broken. A `diff` block reads as "here is the shape of the fix" and promises nothing the UI can't deliver. Same reasoning as the Azure DevOps diff-box spec on `feature/multi-provider-support` (spec 22 there), reached independently — there the suggestion mechanism is missing from the platform, here it's missing because the line isn't in the diff.

Section omitted entirely when empty, per the existing `diagram` / `relatedPRs` convention.

## Schema/Type Changes Needed

- `reviewResponseSchema.comments[].scope: "diff" | "surrounding"` (`lib/ai/review.ts`) — required, not optional, so the model must classify rather than defaulting silently.
- `REVIEW_SYSTEM_PROMPT` (`lib/ai/prompts.ts`): document `scope` in the inline-comment rules, and amend "Surrounding code risks" to say these findings will be reported separately and are not expected to carry applyable suggestions.
- `OutOfDiffFinding` type + `outOfDiff` collection in `postReviewComments`; third parameter on `buildReviewBody` (`lib/github/comments.ts`).
- No database schema change — `reviews.comments` already stores these rows.

## Explicitly Out of Scope

- **Relaxing the `suggestion` contract for surrounding findings.** The prompt spends ~14 lines (`prompts.ts:126-139`) enforcing byte-exact replacements, and both rule headers state the reason outright: the text is applied verbatim. That justification does not hold for a body-rendered finding no one can click Apply on, so there is a real token saving available in letting those suggestions be illustrative rather than exact. Deferred deliberately: the saving is speculative until we can see how often surrounding findings actually appear per review, and this feature is what produces that data. Revisit once a few real PRs have rendered the section.
- **File-level GitHub comments** (`subject_type: "file"`), which would let out-of-diff findings attach to the file rather than the body. Viable for changed files, impossible for unchanged ones, and a less familiar UI affordance — the body section covers both cases with no new API surface, and ports to other providers as plain markdown.
- **Anchoring to the nearest in-diff line.** Rejected outright, not deferred: it puts a comment on code that isn't the problem, and any suggestion attached would corrupt the file if applied.

## Known Risk — Re-Review Nagging

A pre-existing issue that never gets fixed is *still present* on the next `synchronize`, so the model will keep finding it, correctly, forever. Feature 16's `previousReview` context instructs against re-raising stale items, but that instruction is aimed at findings that were fixed or withdrawn — it does not fit an issue that is genuinely still there.

Left unsolved in v1 beyond the cap of 5. It is the thing most likely to make this feature annoying rather than useful, and worth watching on the first few re-reviews. If it does bite, the likely shape of a fix is collapsing repeats into a single line ("3 previously noted issues outside this diff remain") by matching against `previousReview.comments` on path + body similarity, rather than re-rendering the full section every time.
