# Feature 7: Repository Memory via PR Comment Replies

## Overview

When KOINCODE posts a review comment on a PR, the user can reply to it on GitHub to teach the agent — e.g., "we prefer `type` over `interface`", "ignore this, it's our convention", "always check for null on this API response". The agent extracts a reusable rule from the reply, stores it as a **repo memory**, and applies it to all future reviews of that repository.

The agent also replies to the user's comment on GitHub confirming what it learned.

## Why

Generic code review feedback is the #1 complaint with AI reviewers. Every codebase has conventions, intentional patterns, and domain-specific rules that a general-purpose LLM doesn't know about. Rather than making users fill out a settings form, this lets them teach the agent naturally — in the same place they already work (GitHub PR comments). Over time, the agent gets smarter about each repo.

## User Flow

1. KOINCODE posts a review comment on a PR: "Consider using an `interface` here for better extensibility."
2. The user replies to the comment on GitHub: "We always use `type` over `interface` in this project."
3. GitHub fires a `pull_request_review_comment` webhook event (action: `created`).
4. The webhook handler detects the reply is to a KOINCODE-authored comment.
5. An Inngest job (`process-comment-reply`) fires:
   a. Uses the LLM to extract a rule from the conversation (original comment + user reply).
   b. Stores the rule in the `repo_memories` table.
   c. Replies to the user's comment on GitHub: "Got it — I'll remember to prefer `type` over `interface` in this repo."
6. On the next review of this repo, all stored memories are included in the prompt.

## Schema Changes

### New table: `repo_memories`

| Column       | Type      | Default        | Notes                                              |
|-------------|-----------|----------------|----------------------------------------------------|
| `id`        | uuid      | defaultRandom  | Primary key                                        |
| `repo_id`   | uuid      | —              | FK → `repos.id`, ON DELETE CASCADE                 |
| `user_id`   | uuid      | —              | FK → `users.id`, ON DELETE CASCADE (who taught it) |
| `rule`      | text      | —              | The extracted rule, one sentence                   |
| `source_url`| text      | —              | GitHub permalink to the reply that taught it        |
| `is_active` | boolean   | true           | Soft-disable without deleting                      |
| `created_at`| timestamp | now()          | —                                                  |

## Webhook Changes

### Subscribe to `pull_request_review_comment` events

Update `createRepoWebhook` in `lib/github/webhooks.ts`:

```typescript
events: ["pull_request", "pull_request_review_comment"],
```

### Handle the new event in `app/api/webhooks/github/route.ts`

Add handling for `x-github-event: pull_request_review_comment`:

- Filter to `action: "created"` (new replies only).
- Check if the comment is a reply (`in_reply_to_id` is present).
- Look up the parent comment by `in_reply_to_id`. The parent must be a KOINCODE-authored comment — check if the `githubCommentId` exists in a `reviews.comments` JSONB entry for a connected repo.
- If it matches, dispatch a `comment/reply-received` Inngest event.

### Event payload shape

```typescript
type CommentReplyEvent = {
  repoId: string;
  userId: string;
  prNumber: number;
  repoFullName: string;
  originalComment: string;     // the KOINCODE review comment body
  userReply: string;           // the user's reply text
  replyCommentId: number;      // GitHub ID of the user's reply (for responding)
  sourceUrl: string;           // permalink to the reply
};
```

## Inngest Function: `process-comment-reply`

### Steps

1. **Extract rule** — Call the user's LLM (same provider/model as their review key) with a prompt:
   - System: "You extract coding rules and preferences from conversations between a code reviewer and a developer. Given the original review comment and the developer's reply, extract a single concise rule that should apply to future reviews of this codebase. If the reply is not teaching a rule (e.g., just saying 'thanks' or 'fixed'), return null."
   - User: The original comment + reply.
   - Output schema: `{ rule: string | null }`

2. **Deduplicate** — Before inserting, check existing `repo_memories` for this repo. Use the LLM (or simple text similarity) to check if a substantially similar rule already exists. If so, skip insertion.

3. **Store** — Insert into `repo_memories`.

4. **Confirm on GitHub** — Reply to the user's comment: "Got it — I'll remember: *{rule}*" using the GitHub API (`POST /repos/{owner}/{repo}/pulls/{prNumber}/comments` with `in_reply_to`).

5. **Skip if not a rule** — If the LLM determines the reply isn't teaching anything (just a "thanks" or "fixed it"), don't store anything and don't reply.

## Prompt Integration

### Update `lib/ai/prompts.ts`

Add a `repoMemories` parameter to `buildReviewPrompt()`. When present, insert a section:

```
## Repository Rules (learned from past reviews)

These are conventions and preferences specific to this codebase. Respect them in your review:

- Prefer `type` over `interface` for all TypeScript type definitions.
- Ignore unused import warnings in test files — they're used by the test runner.
- The `ApiResponse` type always includes a `data` field, even on errors.
```

### Update `lib/inngest/functions.ts`

In the `processReview` pipeline, add a step after `load-config` to fetch repo memories:

```typescript
const repoMemories = await step.run("load-repo-memories", async () => {
  return await db
    .select({ rule: repoMemoriesTable.rule })
    .from(repoMemoriesTable)
    .where(
      and(
        eq(repoMemoriesTable.repoId, repoId),
        eq(repoMemoriesTable.isActive, true)
      )
    );
});
```

Pass `repoMemories` through to `runReview()` and into `buildReviewPrompt()`.

## Files Created

| File | Purpose |
|------|---------|
| `lib/db/schema/repo-memories.ts` | Drizzle schema for `repo_memories` table |
| `lib/ai/memory.ts` | Rule extraction prompt and LLM call for parsing replies |

## Files Modified

| File | Change |
|------|--------|
| `lib/db/schema/index.ts` | Export `repoMemories` |
| `lib/github/webhooks.ts` | Add `pull_request_review_comment` to webhook events |
| `app/api/webhooks/github/route.ts` | Handle `pull_request_review_comment` event |
| `lib/inngest/functions.ts` | Add `processCommentReply` function, add memory loading to `processReview` |
| `app/api/inngest/route.ts` | Register `processCommentReply` |
| `lib/ai/prompts.ts` | Add `repoMemories` section to prompt builder |
| `lib/ai/review.ts` | Pass `repoMemories` through to prompt |
| `lib/github/comments.ts` | Add helper to reply to a specific comment |

## Memory Management

### Limits

- Max 50 active memories per repo. If the limit is hit, the oldest memory is deactivated when a new one is added.
- Rules are capped at 280 characters (force the LLM to be concise).

### Settings page (future)

The Settings page "Repository Memory" card can list stored memories per repo, letting users:
- View all learned rules.
- Toggle `is_active` on/off.
- Delete rules.
- Manually add rules (textarea fallback).

This is out of scope for this feature — the PR comment flow is the primary input mechanism.

## Error Handling

- **LLM fails to extract a rule:** Log and skip. No GitHub reply. No memory stored.
- **GitHub reply fails to post:** Log and skip. The memory is still stored — the confirmation is best-effort.
- **No API key configured:** Skip silently. Can't call the LLM without a key.
- **User replies to a non-KOINCODE comment:** The webhook handler filters these out before dispatching.

## Key Decisions

- **LLM-extracted rules over raw text** — The user's reply might be conversational ("nah we don't do that here, we always use X because of Y"). The LLM distills this into a clean, reusable one-liner: "Always use X instead of Y." This keeps the prompt section compact.
- **Per-repo, not per-user** — Coding conventions are project-level. A user's preference for `type` over `interface` in repo A doesn't apply to repo B.
- **Soft-disable over delete** — `is_active` lets users turn off rules without losing them. Useful when conventions change.
- **No separate embedding/vector store** — Repo memories are short text rules, not large documents. A simple DB query and string injection into the prompt is sufficient. 50 rules × ~50 words each = ~2,500 tokens, well within limits.
- **Confirmation reply** — Telling the user what the agent learned builds trust and lets them correct misunderstandings immediately.
