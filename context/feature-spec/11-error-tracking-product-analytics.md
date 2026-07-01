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

### 7. Mixpanel Dashboard — Report Reference (Free Plan: 5 Reports)

#### Report 1: Onboarding Funnel

**Type:** Funnel
**Events (in order):** `user_signed_in` → `onboarding_completed` → `repo_connected` → `review_completed`
**Conversion window:** 7 days

**How to read it:**
- Each step shows the % of users who progressed from the previous step.
- A steep drop between `user_signed_in` and `onboarding_completed` means the onboarding UX is losing people — simplify it or make the value proposition clearer.
- A drop between `onboarding_completed` and `repo_connected` means users added their API key but didn't connect a repo — the repos page needs a stronger CTA or the flow isn't obvious.
- A drop between `repo_connected` and `review_completed` means users connected repos but never opened a PR (or reviews are failing) — check `review_failed` events for errors.
- Healthy target: 60%+ conversion from sign-in to first review completed.

#### Report 2: Review Pipeline

**Type:** Insights (Line chart, grouped by Day)
**Metrics (each as a separate line):**
- `review_requested` (Total) — demand: how many PRs triggered reviews
- `review_completed` (Total) — delivery: how many reviews succeeded
- `review_failed` (Total) — errors: how many reviews broke
- `review_cancelled` (Total) — waste: how many reviews were abandoned

**How to read it:**
- **Healthy state:** `review_requested` and `review_completed` lines track closely. `review_failed` and `review_cancelled` stay near zero.
- **Spike in `review_failed`:** Something broke — check Sentry for the error. Common causes: API key expired, provider outage, model rate-limited, malformed diff.
- **Spike in `review_cancelled`:** Users are merging/closing PRs before reviews finish. The pipeline is too slow — check review duration or consider optimizing the prompt/context retrieval.
- **Gap between `requested` and `completed`:** Some reviews are stuck or failing silently. Check Inngest dashboard for stuck jobs.
- **`review_requested` dropping over time:** Users are disconnecting repos or churning. Cross-reference with the Retention report.
- **`review_requested` spiking:** A user connected a high-activity repo, or a team adopted the tool. Good sign.

#### Report 3: Feature Engagement

**Type:** Insights (Bar chart, Last 30 days)
**Events (all in one chart, Total count per event):**
- `api_key_added` — new keys being configured
- `api_key_model_changed` — users experimenting with models
- `api_key_deleted` — users removing keys (potential churn signal)
- `repo_connected` — repos being onboarded
- `repo_disconnected` — repos being removed (churn signal)
- `memory_rule_added` — users teaching the agent
- `memory_rule_toggled` — users managing their rules
- `memory_rule_deleted` — users cleaning up rules
- `review_adoption_detected` — someone acted on a suggestion = the feature worked
- `review_completed` — review was generated

**How to read it:**
- **High `api_key_model_changed`:** Users are experimenting with models — consider surfacing model comparison data or recommendations.
- **High `repo_disconnected` relative to `repo_connected`:** Users are trying the tool and removing it — reviews aren't providing enough value. Check review quality.
- **Low `memory_rule_added`:** Users aren't discovering the memory feature — consider prompting them after their first review or making the feature more visible.
- **`api_key_deleted` with no `api_key_added`:** User is leaving — potential churn. If this pattern appears across multiple users, investigate review quality or UX friction.
- **Zero across the board:** No one is using settings/features — could mean the defaults are good enough, or users aren't engaged enough to customize.

#### Report 3b: Review Quality Funnel

**Type:** Funnel
**Events (in order):** `review_completed` → `review_adoption_detected` → `review_adoption_summary`
**Conversion window:** 30 days
**Breakdown:** `model` (to compare quality across providers)

**How to read it:**
- **Step 1 → 2 conversion (review_completed → adoption_detected):** The % of reviews where the user modified code near at least one comment in a subsequent push. This is your primary quality signal — higher = reviews are useful.
- **Step 2 → 3 conversion (adoption_detected → adoption_summary):** Whether those PRs were eventually merged. Should approach 100% for healthy PRs.
- **Time to adopt (shown between steps):** How long between the review posting and the user pushing a fix. Shorter = user trusted the suggestion immediately. Longer = hesitation or the fix was complex.
- **Breakdown by `model`:** Compare adoption rate across Anthropic, OpenAI, Google, OpenRouter. The model with the highest step 1→2 conversion is giving the most actionable reviews.
- **Adoption rate below 30%:** Reviews are generating noise — too many low-confidence comments. Tighten the system prompt or raise the bar for what gets flagged.
- **Adoption rate above 70%:** Reviews are high signal. Consider increasing comment volume or covering more issue categories.
- **`review_adoption_summary` properties** (`adoption_rate`, `adopted_count`, `ignored_count`) are NOT visible in the funnel — the funnel only shows conversion counts and time between steps. To chart these values you need a separate Insights report (see Report 3c below).

#### Report 3c: Adoption Rate Over Time

**Type:** Insights (Line chart, grouped by Day)
**Event:** `review_adoption_summary`
**Metric:** Average of property `adoption_rate`

This is a separate report from the funnel. Where the funnel tells you "what % of reviews had at least one adoption", this chart tells you "on average, what fraction of comments per review were adopted" — a finer-grained quality signal.

**How to build it in Mixpanel:**
1. Create a new Insights report
2. Select event: `review_adoption_summary`
3. Change the aggregation from `Total` to `Average` → select property `adoption_rate`
4. Group by Day (or Week for smoother signal)
5. Optional: add a second metric line for `adopted_count` (Average) and `ignored_count` (Average) to see the raw comment counts alongside the rate

**How to read it:**
- **Rising line over time:** Reviews are getting better — prompt changes or model improvements are working.
- **Flat line:** Quality is stable. Fine if already high; act if it's stuck below 40%.
- **Drop after a model/prompt change:** The change made reviews worse. Roll back or investigate which comment categories dropped.
- **Breakdown by `model`:** Add a breakdown on `model` property to see which provider consistently delivers the highest average adoption rate across all reviews — this is your ground-truth model comparison, grounded in real user behavior.

#### Report 4: Active Users (DAU)

**Type:** Insights (Line chart, grouped by Day)
**Metric:** `page_viewed` → Unique Users

**How to read it:**
- Shows how many distinct users visit the dashboard each day.
- **Steady or growing line:** Healthy adoption. Users are coming back.
- **Declining line:** Users are churning. Cross-reference with the Retention report to confirm.
- **Spikes:** Likely correlated with team onboarding or a marketing push. Check if the new users convert (Onboarding Funnel).
- **Flat at 1:** Only you (the founder) are using it. Time to get more users.
- Toggle the top bar between **Day** / **Week** / **Month** to see WAU and MAU. DAU/WAU ratio above 40% = strong stickiness for a dev tool.

#### Report 5: Retention

**Type:** Retention (Weekly, 4 weeks)
**Start event:** `review_completed`
**Return event:** `review_completed`

**How to read it:**
- Shows the % of users who got a review in Week 0 and came back for another review in Weeks 1–4.
- **Week 1 retention 50%+:** Strong — users who try the product come back.
- **Week 1 retention below 20%:** Users try it once and leave — the first review didn't deliver enough value. Improve review quality, reduce false positives, or add more actionable suggestions.
- **Curve flattens (e.g., Week 2–4 stays at ~30%):** You have a core group of retained users. This is product-market fit territory. Focus on growing the top of the funnel.
- **Curve drops to 0% by Week 4:** Nobody sticks around. Critical problem — the product isn't solving a recurring need, or the review quality degrades over time.
- **Week 0 is always 100%** — that's the baseline cohort. Every subsequent week measures how many of them returned.

### 8. Env Var Summary

```
# Sentry (Error Tracking)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=

# Mixpanel (Product Analytics)
NEXT_PUBLIC_MIXPANEL_TOKEN=
```
