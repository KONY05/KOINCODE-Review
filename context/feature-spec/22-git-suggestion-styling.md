# Feature 22: Diff-Style Suggestion Box for Non-Native Platforms

## Overview

Prompted by watching a CodeRabbit review in a tutorial video: instead of the GitHub-native `\`\`\`suggestion` fence, CodeRabbit renders a `\`\`\`diff` fenced code block (red `-` / green `+` lines) inside the comment body, alongside a separate collapsible "Committable suggestion" section and a "Prompt for AI Agents" section.

This document scopes **only** the diff-style box itself — a markdown-rendered stand-in for the suggestion box on platforms whose PR/MR commenting surface doesn't render our current `\`\`\`suggestion` fence as a one-click "Apply suggestion" button. It is not adopting CodeRabbit's collapsible "Committable suggestion" or "Prompt for AI Agents" sections; those are explicitly out of scope for this feature.

## Current State (confirmed by reading the provider code)

- `formatCommentBody()` (`lib/providers/review-body.ts:51-59`) appends a plain `\`\`\`suggestion` fence when `comment.suggestion` is set. Used directly by GitHub (`lib/providers/github/comments.ts:184`) and Azure DevOps (`lib/providers/azure-devops/comments.ts:37`).
- GitLab has its own variant, `formatGitlabCommentBody()` (`lib/providers/gitlab/comments.ts:16-23`), which adds a `:-N+0` offset annotation for multi-line ranges — needed only because GitLab anchors the comment differently, not because the suggestion mechanism itself differs. Its own doc comment (lines 5-15) is explicit that GitLab renders this **the same one-click "Apply suggestion" button as GitHub**.
- Azure DevOps's `postReviewComments()` doc comment (`lib/providers/azure-devops/comments.ts:15-17`) already flags the gap this feature closes: the `\`\`\`suggestion` fence there "renders as a plain code block... Azure DevOps threads have no equivalent affordance." Feature 19's "Explicitly Not Resolved" section (line 93) flagged this exact unknown at the time; it's now confirmed.
- **Conclusion: GitHub and GitLab keep their existing native suggestion fence unchanged.** Azure DevOps is the only current target for a diff-style box. The design below is a general `supportsNativeSuggestions` capability rather than an Azure-DevOps-specific hack, so future providers (Feature 16 talks about "extra provider support") fall into the right bucket automatically instead of needing a new special case each time.

## Design

### 1. Provider capability flag

Add to `GitProvider` (`lib/providers/types.ts`):

```ts
export type GitProvider = {
  readonly id: GitProviderId;
  readonly supportsNativeSuggestions: boolean;
  // ...existing members
};
```

- `true` for GitHub and GitLab.
- `false` for Azure DevOps.

### 2. Recovering the "before" text

A diff box needs both the removed and added lines; today `DraftReviewComment` (`lib/providers/types.ts:33-39`) only carries `suggestion` (the new code) — the LLM is explicitly instructed (`lib/ai/prompts.ts:102-108`) to emit *only* the replacement text, never the original. Nothing today stores "what code is being replaced" as its own string; it's implicit in `startLine`/`line` pointing into the file.

The raw material to reconstruct it is already in scope at the point comments are built: `fileContents: Map<string, string>` (full new-file text per path, built in `lib/inngest/functions.ts:391-397`) is available alongside `reviewData.response.comments` before they're passed to `postReviewComments()` (`functions.ts:531`).

**Decision:** add an extraction step where comments are assembled in `functions.ts`, populating a new optional field:

```ts
export type DraftReviewComment = {
  path: string;
  startLine?: number;
  line: number;
  body: string;
  suggestion?: string;
  originalCode?: string; // new — lines (startLine ?? line)..line from fileContents, only when suggestion is set
};
```

Computed via `fileContents.get(path)?.split("\n").slice((startLine ?? line) - 1, line).join("\n")`. If the file content isn't available for that path (shouldn't happen for a line a comment is anchored to, but not guaranteed), `originalCode` is simply left `undefined` and the diff box degrades to add-only lines — still correct, just not showing a removal.

### 3. Diff box formatter

New function alongside `formatCommentBody` in `lib/providers/review-body.ts`, used only when `!provider.supportsNativeSuggestions`:

```ts
export function formatDiffSuggestionBody(comment: DraftReviewComment): string {
  if (comment.suggestion == null) return comment.body;

  const removed = (comment.originalCode ?? "").split("\n").filter(Boolean).map((l) => `-${l}`);
  const added = comment.suggestion.split("\n").map((l) => `+${l}`);

  return `${comment.body}\n\n\`\`\`diff\n${[...removed, ...added].join("\n")}\n\`\`\``;
}
```

GitHub renders `\`\`\`diff` fences with syntax color (red/green) natively as plain Markdown — no special API or platform support required, which is exactly why this works as a drop-in for platforms lacking the real suggestion affordance.

`lib/providers/azure-devops/comments.ts:37` switches from `formatCommentBody(comment)` to `formatDiffSuggestionBody(comment)`. GitHub and GitLab's call sites are untouched.

## Schema/Type Changes Needed

- `GitProvider.supportsNativeSuggestions: boolean` — new required field, set per provider implementation.
- `DraftReviewComment.originalCode?: string` — new optional field.
- No database schema changes; this is entirely in-memory formatting.

## Explicitly Not Resolved by This Document

- CodeRabbit's "Committable suggestion" collapsible and "Prompt for AI Agents" section — deliberately out of scope, not just deferred.
- Whether Azure DevOps threads render `\`\`\`diff` fences with color at all (untested against a live org, same caveat Feature 19 flagged for the plain suggestion fence) — if Azure DevOps's Markdown renderer doesn't colorize diff fences, this still improves readability (clear +/- prefixes) even without color, so it's not a blocking risk, just worth confirming when Azure DevOps is next tested live.
