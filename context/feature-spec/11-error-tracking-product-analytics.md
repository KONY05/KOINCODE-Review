# Feature 11: Error Tracking (Sentry) & Product Analytics (Mixpanel)

## Overview

Add Sentry for full error tracking (error boundaries, server-side tracing, performance monitoring, source maps) and Mixpanel for product analytics (user journey tracking, feature engagement, funnel analysis).

## Why

The app is approaching production readiness. Without observability:
- Runtime errors in background jobs (Inngest functions), webhook handlers, and LLM calls go unnoticed until a user reports them.
- There's no visibility into user adoption, feature engagement, or where users drop off.
- Performance regressions in the review pipeline or GitHub API calls are invisible.

Sentry catches the errors. Mixpanel answers the product questions.

## Implementation Plan

### 1. Sentry — Full Next.js Integration

#### Install & Configure

- `@sentry/nextjs` package.
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — three config files required by the Next.js SDK.
- `next.config.ts` — wrap with `withSentryConfig()` for source map uploads and auto-instrumentation.
- `instrumentation.ts` — Next.js instrumentation hook to initialize Sentry on the server.
- `app/global-error.tsx` — top-level error boundary that reports to Sentry.

#### What Gets Tracked

- **Unhandled exceptions** — client and server, automatic.
- **Server-side tracing** — API routes, server actions, server components.
- **Performance monitoring** — page loads, navigation, API latency.
- **Source maps** — uploaded at build time for readable stack traces.
- **Inngest function errors** — manually captured via `Sentry.captureException()` in catch blocks.
- **Webhook failures** — signature verification errors, GitHub API errors.
- **LLM call failures** — provider errors, timeout, malformed responses.

#### Env Vars

```
NEXT_PUBLIC_SENTRY_DSN=        # Sentry project DSN
SENTRY_ORG=                    # Sentry org slug (build-time, source maps)
SENTRY_PROJECT=                # Sentry project slug (build-time, source maps)
SENTRY_AUTH_TOKEN=              # Sentry auth token (build-time, source maps)
```

### 2. Mixpanel — Product Analytics

#### Install & Configure

- `mixpanel-browser` for client-side tracking.
- `mixpanel` (Node.js SDK) for server-side tracking in actions and Inngest functions.
- Analytics module: `lib/analytics/mixpanel.ts` — thin wrappers around `track()`, `identify()`, `people.set()` for both client and server.
- `lib/analytics/events.ts` — event name constants (single source of truth).
- `components/providers/analytics-provider.tsx` — client component that initializes Mixpanel and identifies the user on mount.

#### Env Vars

```
NEXT_PUBLIC_MIXPANEL_TOKEN=    # Mixpanel project token
```

### 3. Tracking Plan — Mixpanel Events

All event names use `snake_case`. Properties follow Mixpanel conventions (`$` prefix for reserved).

#### Authentication & Onboarding

| Event | Trigger | Key Properties |
|---|---|---|
| `user_signed_in` | GitHub OAuth button click | — |
| `onboarding_completed` | `completeOnboarding()` with API key | `provider`, `model` |
| `onboarding_skipped` | `completeOnboarding(null)` | — |

#### Repository Management

| Event | Trigger | Key Properties |
|---|---|---|
| `repo_connected` | `connectRepo()` success | `repo_name`, `language` |
| `repo_disconnected` | `disconnectRepo()` success | `repo_name` |
| `repo_indexing_completed` | Inngest `index-repo` success | `repo_name`, `files_indexed`, `duration_ms` |
| `repo_indexing_failed` | Inngest `index-repo` failure | `repo_name`, `error` |

#### API Key Management

| Event | Trigger | Key Properties |
|---|---|---|
| `api_key_added` | `addApiKey()` success | `provider`, `model`, `is_first_key` |
| `api_key_deleted` | `deleteApiKey()` success | `provider` |
| `api_key_activated` | `toggleApiKeyDefault()` → active | `provider`, `model` |
| `api_key_deactivated` | `toggleApiKeyDefault()` → inactive | `provider` |
| `api_key_model_changed` | `updateApiKeyModel()` success | `provider`, `old_model`, `new_model` |

#### Code Reviews

| Event | Trigger | Key Properties |
|---|---|---|
| `review_requested` | Webhook → `pr/review-requested` | `repo_name`, `pr_number` |
| `review_completed` | Inngest `process-review` success | `repo_name`, `pr_number`, `model`, `provider`, `comment_count`, `duration_ms`, `tokens_used` |
| `review_failed` | Inngest `process-review` failure | `repo_name`, `pr_number`, `error`, `failure_reason` |
| `review_cancelled` | Webhook → `pr/review-cancelled` | `repo_name`, `pr_number`, `reason` |

#### Repository Memory

| Event | Trigger | Key Properties |
|---|---|---|
| `memory_rule_added` | `addMemory()` or `processCommentReply` | `repo_name`, `source` (`manual` / `github`) |
| `memory_rule_deleted` | `deleteMemory()` | `repo_name` |
| `memory_rule_toggled` | `toggleMemoryActive()` | `repo_name`, `is_active` |

#### Page Views

| Event | Trigger | Key Properties |
|---|---|---|
| `page_viewed` | Analytics provider route change | `page_name`, `path` |

#### User Properties (set via `people.set`)

| Property | Value | When Set |
|---|---|---|
| `github_username` | From Clerk profile | On identify |
| `email` | From Clerk profile | On identify |
| `onboarding_status` | `completed` / `skipped` | On onboarding |
| `connected_repos_count` | Count from DB | On repo connect/disconnect |
| `active_provider` | Current default key provider | On key change |
| `total_reviews` | Cumulative review count | On review complete |

### 4. Integration Points

#### Client-Side (`components/providers/analytics-provider.tsx`)

- Wrap the dashboard layout (not the root layout — no tracking on the landing page for unauthenticated users).
- Initialize Mixpanel with `NEXT_PUBLIC_MIXPANEL_TOKEN`.
- On mount: `mixpanel.identify(clerkUserId)` and set user properties from Clerk's `useUser()`.
- Track `page_viewed` on route changes via `usePathname()`.

#### Server Actions (`lib/actions/*.ts`)

- Import server-side Mixpanel and call `track()` after successful mutations.
- User identity comes from `auth()` (Clerk).

#### Inngest Functions (`lib/inngest/functions.ts`)

- Import server-side Mixpanel and call `track()` at key lifecycle points (review started/completed/failed, indexing completed/failed).
- Include timing data (`duration_ms`) computed from step start/end.

#### Sentry Context

- Set Sentry user context (`Sentry.setUser()`) in the analytics provider alongside Mixpanel identify.
- Tag Inngest function errors with `repoName`, `reviewId`, `provider` for filtering in Sentry.

### 5. Files to Create

| File | Purpose |
|---|---|
| `sentry.client.config.ts` | Sentry client-side init |
| `sentry.server.config.ts` | Sentry server-side init |
| `sentry.edge.config.ts` | Sentry edge runtime init |
| `instrumentation.ts` | Next.js instrumentation hook |
| `app/global-error.tsx` | Root error boundary |
| `lib/analytics/mixpanel.ts` | Mixpanel client + server wrappers |
| `lib/analytics/events.ts` | Event name constants |
| `components/providers/analytics-provider.tsx` | Client-side Mixpanel init + identify + page tracking |

### 6. Files to Modify

| File | Change |
|---|---|
| `next.config.ts` | Wrap with `withSentryConfig()` |
| `app/(dashboard)/layout.tsx` | Add `<AnalyticsProvider>` |
| `lib/actions/repos.ts` | Add Mixpanel `track()` calls |
| `lib/actions/api-keys.ts` | Add Mixpanel `track()` calls |
| `lib/actions/onboarding.ts` | Add Mixpanel `track()` calls |
| `lib/actions/repo-memories.ts` | Add Mixpanel `track()` calls |
| `lib/inngest/functions.ts` | Add Mixpanel `track()` + Sentry `captureException()` calls |
| `app/api/webhooks/github/route.ts` | Add Mixpanel `track()` for webhook events |
| `config/env.ts` | Add Sentry + Mixpanel env vars |
| `.env.local` | Add new env var placeholders |
| `package.json` | Add `@sentry/nextjs`, `mixpanel-browser`, `mixpanel` |

### 7. Env Var Summary

```
# Sentry (Error Tracking)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=

# Mixpanel (Product Analytics)
NEXT_PUBLIC_MIXPANEL_TOKEN=
```
