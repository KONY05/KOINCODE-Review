# Feature 14: CLI Integration — Device Auth & Repo Connect API

## Overview

Expose a small token-based API surface so the KOINCODE CLI (a separate terminal application, `/Users/mac/Documents/Code/KOINCODE`) can authenticate as a Review user and connect/disconnect the repo the user is currently working in — without ever touching Clerk session cookies directly. This is the API-side half of a two-repo feature; the CLI-side commands are specified in `KOINCODE/context/feature-specs/42-koincode-review-integration.md`.

## Why

Today the only way to use KOINCODE-Review is through the web dashboard: sign in, click through the GitHub repo list, click "Connect." Users of the KOINCODE CLI already have their repo open in a terminal — making them alt-tab to a browser, find the right repo in a paginated list, and click connect is friction that a single CLI command can remove. But the web app has no concept of API auth today; everything runs off a Clerk session cookie scoped to the browser. This feature adds the minimum needed for a CLI to act as an authenticated client: a device-authorization pairing flow (same shape as `gh auth login` / `vercel login`) and two endpoints that reuse the existing repo-connect logic.

## Device Authorization Flow

Single-device variant (no cross-device user code required, since the CLI can open the same machine's browser directly):

1. CLI calls `POST /api/cli/device` (no auth). Server generates a random `deviceCode` (32 bytes, base64url), inserts a pending row into Postgres (not in-memory — see Schema below), returns:
   ```json
   { "deviceCode": "...", "verificationUrl": "https://.../cli-auth", "expiresIn": 300, "interval": 3 }
   ```
2. CLI opens the user's browser to `{verificationUrl}?device_code={deviceCode}`.
3. That page (`app/cli-auth/page.tsx`) requires a Clerk session — if not signed in, Clerk's existing GitHub OAuth redirect handles it inline (this is also how a first-time user's account gets created, satisfying the "instant account" goal with zero new signup code). Once signed in, the page shows "Authorize KOINCODE CLI on this machine?" with Allow/Deny. Allow calls a server action that marks the pending device row `approved` with the signed-in `userId`.
4. Meanwhile the CLI polls `POST /api/cli/device/token` with `{ deviceCode }` every `interval` seconds. Once approved, the endpoint mints a CLI token, stores its hash, deletes the pending device row, and returns the raw token once: `{ "token": "kc_live_...", "userId": "..." }`. Until approved, it returns `{ "status": "pending" }`; after `expiresIn`, `{ "status": "expired" }`.
5. Denied → device row marked `denied`; next poll returns `{ "status": "denied" }`.

## Schema

Two tables, Drizzle. Both Postgres-backed — no in-memory state anywhere in this flow. **Correction from an earlier draft of this spec:** pending device codes were originally going to live in an in-memory `Map`, reasoned as "short-lived and low-volume, fine for a single instance." That's wrong for this deployment target — Vercel Functions give no guarantee that two separate requests (the initial `POST /device`, the browser's approve action, and each subsequent poll) land on the same execution instance, and there's no sticky-session mechanism to request one. Given the real elapsed time in this flow (user has to switch to a browser, possibly complete GitHub OAuth, click Allow), an in-memory store would fail intermittently in production from day one, not just under future scale. Postgres removes the whole risk category instead of deferring it — this table is tiny and short-lived, so the extra round trips are irrelevant.

`lib/db/schema/cli-tokens.ts`:

```ts
export const cliTokens = pgTable("cli_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(), // sha256 of the raw token, never store plaintext
  name: text("name").notNull().default("CLI"), // future-proofing for multiple machines; not user-editable yet
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});
```

`lib/db/schema/pending-device-auth.ts`:

```ts
export const pendingDeviceAuth = pgTable("pending_device_auth", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceCode: text("device_code").notNull().unique(), // looked up on every poll and on approve
  status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // set by the approve action
  expiresAt: timestamp("expires_at").notNull(), // now() + 5 min at insert time
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- `POST /api/cli/device` inserts a row (`status: "pending"`, `expiresAt: now() + 5m`) and, opportunistically, deletes any of the *same request's* already-expired rows it happens to see — no dedicated cleanup cron needed at this volume/TTL (contrast with the existing daily Inngest cron that purges disconnected-repo data after 30 days; that job exists because that data is unbounded and long-lived, this table's rows self-limit to minutes).
- The `/cli-auth` page's Allow/Deny server action looks up by `deviceCode`, checks `expiresAt > now()`, and updates `status` + `userId` (Allow) or just `status` (Deny).
- `POST /api/cli/device/token` looks up by `deviceCode`: `status === "approved"` → mint the CLI token, delete the row, return it; `status === "pending"` and not expired → `{ status: "pending" }`; expired or `status === "denied"` → the corresponding terminal response, then delete the row (nothing left to poll for either way).

## API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/cli/device` | POST | none | Start a device authorization request |
| `/api/cli/device/token` | POST | none (deviceCode is the secret) | Poll for approval, exchange for a CLI token |
| `/api/cli/repos/connect` | POST | Bearer CLI token | Connect a repo by `{ owner, repo }` (GitHub full name) |
| `/api/cli/repos/disconnect` | POST | Bearer CLI token | Disconnect a repo by `{ owner, repo }` |
| `/api/cli/repos/status` | GET | Bearer CLI token | `?owner=&repo=` → connection state + last review summary |

All four Bearer-authed routes share a `lib/cli-auth.ts` helper: `requireCliToken(req)` — hashes the presented token, looks it up in `cliTokens`, 401s if missing, updates `lastUsedAt`, returns `{ userId }`.

### `POST /api/cli/repos/connect`

Reuses the existing `connectRepo` logic from `lib/actions/repos.ts` rather than duplicating it — that function currently assumes a repo object already fetched from GitHub's list-repos endpoint (the dashboard flow). Needs a small refactor: extract the shared tail (webhook creation, DB upsert, initial indexing dispatch) into a function that takes a resolved GitHub repo object, and add a new lookup path — `octokit.repos.get({ owner, repo })` using the user's GitHub token from Clerk — that either flow can feed into. Returns 404 if the authenticated user doesn't have access to that repo on GitHub (same as trying to connect a repo you can't see today).

### `POST /api/cli/repos/disconnect`

Same reuse pattern against the existing `disconnectRepo` action, looked up by `(userId, githubFullName)` instead of `(userId, repoId)`.

## Files Created

| File | Purpose |
|---|---|
| `lib/db/schema/cli-tokens.ts` | `cli_tokens` table |
| `lib/db/schema/pending-device-auth.ts` | `pending_device_auth` table |
| `lib/cli/device-auth.ts` | Postgres-backed pending-device-auth queries (insert, approve, deny, poll, opportunistic expired-row cleanup), token minting/hashing |
| `lib/cli-auth.ts` | `requireCliToken()` bearer-auth helper for route handlers |
| `app/api/cli/device/route.ts` | Start device auth |
| `app/api/cli/device/token/route.ts` | Poll/exchange |
| `app/api/cli/repos/connect/route.ts` | Connect by owner/repo |
| `app/api/cli/repos/disconnect/route.ts` | Disconnect by owner/repo |
| `app/api/cli/repos/status/route.ts` | Status by owner/repo |
| `app/cli-auth/page.tsx` | Browser-side approve/deny screen |

## Files Modified

| File | Change |
|---|---|
| `lib/actions/repos.ts` | Extract shared connect/disconnect tail so both the dashboard action and the new CLI routes call the same underlying logic |
| `lib/db/schema/index.ts` (or equivalent barrel) | Export `cliTokens` and `pendingDeviceAuth` |
| `drizzle.config.ts` / migrations | New migration for `cli_tokens` and `pending_device_auth` |

## Key Decisions

- **Single-device flow, no manual user code.** Since the CLI opens the browser on the same machine, there's no second device that needs a short code to type in — `deviceCode` in the URL query string is enough. This is simpler than GitHub's classic device flow and matches what `vercel login`/`netlify login` actually do for the common case.
- **Reuse `connectRepo`/`disconnectRepo`, don't fork them.** The CLI path only differs in how the target repo is resolved (owner/repo vs. a pre-fetched list item); webhook setup, DB writes, and indexing dispatch must stay identical to the dashboard path so behavior doesn't drift between the two entry points.
- **CLI tokens are separate from Clerk sessions**, hashed at rest (sha256 is sufficient — these are high-entropy generated tokens, not user-chosen passwords, so no bcrypt/argon2 needed), never logged, shown to the user exactly once at mint time. No expiry in v1 (revoke-by-delete only) — an expiry/rotation policy is a reasonable follow-up, not blocking for phase 1.
- **No new UI for managing CLI tokens** (listing/revoking from Settings) in this pass — out of scope, noted below.
- **Pending device-auth state lives in Postgres, not in-memory** — required by the Vercel deployment target, not a nice-to-have. See Schema above for the full reasoning; this replaces an earlier in-memory-`Map` draft of this spec.

## Open Questions / Deferred

- **No token management UI.** Users can't see or revoke active CLI tokens from Settings yet — for phase 1, revocation means asking to delete the row directly. Worth a small Settings section once there's more than one CLI-integration feature to manage.
- **Rate limiting on `/api/cli/device` and `/token`** — not addressed here; low risk given the short expiry, but worth a pass before this is publicly exposed at scale.
