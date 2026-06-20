# Feature Spec: GitHub Webhook Endpoint for PR Events

## What It Does

A `POST /api/webhooks/github` endpoint that receives GitHub webhook events when PRs are opened or updated on connected repos, verifies the HMAC-SHA256 signature, and enqueues an Inngest background job to trigger the AI review.

## Scope

### In Scope

1. **Webhook route** (`app/api/webhooks/github/route.ts`) — receives `pull_request` events from GitHub.
2. **Signature verification** — HMAC-SHA256 using `GITHUB_WEBHOOK_SECRET`.
3. **Event filtering** — only process `opened` and `synchronize` actions (new PR or new commits pushed).
4. **Repo lookup** — match incoming repo by `githubId` to a connected (active) repo in the DB.
5. **Review record creation** — insert a `reviews` row with status `pending`.
6. **Inngest event dispatch** — send a `pr/review-requested` event with all data the review job needs.
7. **Webhook auto-installation** — when a repo is connected, create a GitHub webhook on that repo; store the `webhookId`. On disconnect, delete the webhook.
8. **Make `GITHUB_WEBHOOK_SECRET` required** in env validation.

### Out of Scope (next features)

- The actual AI review Inngest function (stub only).
- Diff fetching, LLM calls, comment posting.

## Implementation Plan

### 1. Webhook management helpers — `lib/github/webhooks.ts`

- `createRepoWebhook(token, owner, repo, secret)` — GitHub API call to create the webhook (events: `pull_request`, content type: `json`).
- `deleteRepoWebhook(token, owner, repo, webhookId)` — removes the webhook.
- Webhook URL derived from `APP_URL` env var.

### 2. Webhook route — `app/api/webhooks/github/route.ts`

- Read raw body, verify HMAC-SHA256 against `GITHUB_WEBHOOK_SECRET`.
- Parse `x-github-event` header — only handle `pull_request`.
- Filter to `action: "opened" | "synchronize"`.
- Look up repo by `github_id` where `is_active = true`.
- If no matching connected repo → return 200 (silent ignore to prevent GitHub from disabling the webhook).
- Insert a `reviews` row with `pending` status.
- Send `pr/review-requested` Inngest event.
- Return 200.

### 3. Update `connectRepo` / `disconnectRepo` server actions

- `connectRepo`: after DB upsert, call `createRepoWebhook` and store the returned `webhookId`.
- `disconnectRepo`: if `webhookId` exists, call `deleteRepoWebhook` before soft-deleting.

### 4. Inngest stub — `pr/review-requested` handler

- Add a new function in `lib/inngest/functions.ts` that receives the event and logs it.
- Placeholder for the full review agent pipeline.

### 5. Env updates

- Make `GITHUB_WEBHOOK_SECRET` required in `config/env.ts`.
- Add `APP_URL` (required) for constructing the webhook callback URL.

## Key Decisions

- **One shared webhook secret** for all repos (not per-repo). The secret verifies the payload came from GitHub; the repo lookup verifies it's a connected repo.
- **Silent 200 for unmatched repos** — prevents GitHub from disabling the webhook endpoint due to repeated error responses.
- **`synchronize` action included** — triggers a new review when commits are pushed to an open PR, matching CodeRabbit-style behavior.
