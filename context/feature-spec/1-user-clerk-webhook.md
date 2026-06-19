# 1 — Clerk Webhook: Sync user to database on sign-up

## Goal

When a user signs up via GitHub OAuth, persist their profile in the `users` table so the rest of the app can query by `clerkId`.

## Trigger

Clerk `user.created` webhook event.

## Endpoint

`POST /api/webhooks/clerk`

## Steps

1. Receive the webhook POST from Clerk.
2. Verify the request signature using the `svix` library and `CLERK_WEBHOOK_SECRET` env var.
3. Parse the event type — only handle `user.created` (ignore others with `200 OK`).
4. Extract from the event payload:
   - `clerkId` ← `data.id`
   - `email` ← `data.email_addresses[0].email_address`
   - `name` ← `data.first_name + data.last_name` (nullable)
   - `avatarUrl` ← `data.image_url` (nullable)
   - `githubUsername` ← `data.external_accounts[0].username` where `provider === "oauth_github"` (nullable)
5. Insert into the `users` table. If `clerkId` already exists, skip (idempotent).
6. Return `200 OK`.

## Env changes

- Add `CLERK_WEBHOOK_SECRET` to `.env.local` and `config/env.ts`.

## New dependency

- `svix` — Clerk's recommended library for webhook signature verification.

## Clerk Dashboard setup

- Create a webhook endpoint pointing to `<app-url>/api/webhooks/clerk`.
- Subscribe to `user.created`.

## Files touched

- `app/api/webhooks/clerk/route.ts` (new) — webhook handler
- `config/env.ts` — add `CLERK_WEBHOOK_SECRET`
- `.env.local` — add `CLERK_WEBHOOK_SECRET` value
- `package.json` — add `svix` dependency

## Schema reference

```ts
// lib/db/schema/users.ts (existing, no changes needed)
users = pgTable("users", {
  id:                     uuid PK,
  clerkId:                text, unique, not null,
  email:                  text, not null,
  name:                   text, nullable,
  avatarUrl:              text, nullable,
  githubUsername:          text, nullable,
  hasCompletedOnboarding: boolean, default false,
  createdAt:              timestamp, default now(),
  updatedAt:              timestamp, default now(),
});
```

## Edge cases

- **Duplicate delivery:** Clerk may retry failed webhooks. The insert must be idempotent — use `ON CONFLICT (clerk_id) DO NOTHING`.
- **Missing fields:** `name`, `avatarUrl`, and `githubUsername` may be null. Only `clerkId` and `email` are required.
- **Invalid signature:** Return `401` immediately, do not process the payload.
- **Unsupported event type:** Return `200 OK` with no side effects to prevent Clerk from retrying.
