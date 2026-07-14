# Feature 15: CLI Key/Model Sync

## Overview

Adds one new Bearer-authed route, `POST /api/cli/keys/sync`, so the KOINCODE CLI can push its currently active provider API key + model into a user's KOINCODE-Review account — the same `api_keys` row the Settings page's "API Keys" section already manages, just written from a second entry point. This is Phase 2 of the CLI integration; Phase 1 (device auth + repo connect/disconnect/status) is `context/feature-spec/14-cli-integration-auth.md`. CLI-side design (resolution logic, the `/review-sync-keys` command, and why the scope is deliberately narrower than "sync whatever model you're using") is in `KOINCODE/context/feature-specs/42-koincode-review-integration.md`'s "Phase 2" section — this doc covers the API-side half only.

## Why

Today, a user who wants automated reviews has to configure a provider key twice: once locally for the CLI, once again in the Review dashboard's onboarding flow or Settings page. Since KOINCODE already knows which key+model the user is actively using, letting them push that straight from a `/review-sync-keys` command removes the duplicate data entry — without inventing any new storage or activation model on this side, since `api_keys` and its existing add/activate logic already do exactly what's needed.

## Request Shape

```json
POST /api/cli/keys/sync
Authorization: Bearer <cli token>
{ "provider": "anthropic" | "openai" | "google" | "openrouter", "model": "claude-opus-4-6", "apiKey": "sk-ant-..." }
```

Validated with a new Zod schema in `lib/cli/schemas.ts`:

```ts
export const keySyncSchema = z.object({
  provider: z.enum(["anthropic", "openai", "google", "openrouter"]),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});
```

`provider` as a `z.enum` matching `LlmProvider`'s exact values means a malformed/unknown provider string is rejected by the schema itself, before any DB or business logic runs.

## Design

### Model validation

Reject before storing anything if `model` isn't in that provider's list from `config/providers.ts`'s `PROVIDERS`/`getProviderConfig(provider)` — the same canonical list the Settings/onboarding UI's model selector already draws from. This is the "discard if not supported" requirement: a model id the web UI's own dropdown wouldn't offer never gets written, regardless of what the CLI sends.

```ts
const providerConfig = getProviderConfig(parsed.data.provider);
if (!providerConfig.models.includes(parsed.data.model)) {
  return NextResponse.json({ error: "Unsupported model for this provider" }, { status: 400 });
}
```

### Upsert semantics — additive, not overriding

`api_keys` has a unique constraint on `(userId, provider)` — one row per provider per user. The existing dashboard action `addApiKey` (`lib/actions/api-keys.ts`) is insert-only: it sets `isDefault: isFirstKey` (true only if the user has no other key rows yet), but has no path for "a row for this provider already exists, update it" — calling it a second time for the same provider would collide with the unique constraint. Sync needs that update path, so a new function is added rather than reusing `addApiKey` as-is:

```ts
// lib/cli/keys.ts (new, not a "use server" file — same reasoning as lib/repos/index.ts:
// takes an already-resolved userId as a plain argument, must not become a
// client-callable Server Action)
export async function syncApiKeyForUser(
  userId: string,
  provider: LlmProvider,
  model: string,
  apiKey: string,
): Promise<void> {
  const [existingAny] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .limit(1);

  const isFirstKeyEver = !existingAny;

  await db
    .insert(apiKeys)
    .values({
      userId,
      provider,
      model,
      encryptedKey: encrypt(apiKey),
      isDefault: isFirstKeyEver,
    })
    .onConflictDoUpdate({
      target: [apiKeys.userId, apiKeys.provider],
      set: { model, encryptedKey: encrypt(apiKey) }, // isDefault deliberately untouched on update
    });
}
```

The `isFirstKeyEver` check runs *before* the upsert and is only used for the insert branch's `isDefault` value — it has no bearing on the update branch, where `isDefault` is simply omitted from `set` (whatever the row's current activation state is, insert-or-update leaves it alone). This is the precise shape of "add the key, don't override the active one": a genuinely new provider key can auto-activate only if the user had zero keys before; refreshing an existing provider's key value never touches activation, whether that row happened to be the active one or not.

### Route

`app/api/cli/keys/sync/route.ts`:

```ts
export async function POST(req: NextRequest) {
  const auth = await requireCliToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = keySyncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "provider, model, and apiKey are required" }, { status: 400 });
  }

  const providerConfig = getProviderConfig(parsed.data.provider);
  if (!providerConfig.models.includes(parsed.data.model)) {
    return NextResponse.json({ error: "Unsupported model for this provider" }, { status: 400 });
  }

  await syncApiKeyForUser(auth.userId, parsed.data.provider, parsed.data.model, parsed.data.apiKey);

  await trackServer(EVENTS.API_KEY_ADDED, auth.userId, {
    provider: parsed.data.provider,
    source: "cli",
  });

  return NextResponse.json({ success: true });
}
```

`proxy.ts` needs no change — `/api/cli(.*)` is already public (added in Feature 14), and this route does its own Bearer-token check exactly like the repos routes.

### Logging/observability discipline

The raw `apiKey` must never reach Sentry, Mixpanel, or a log line on this path. Concretely: no `console.error`/`Sentry.captureException` call on this route may include `extra: { body }` or similar wholesale-payload logging (a pattern that doesn't exist elsewhere in this codebase today, but is an easy mistake to introduce while debugging a new route) — if an error needs context, log `{ provider, userId }` only, matching how `api_keys`' existing masked-key display (`maskEncryptedKey`, used in `getApiKeys`) already treats the encrypted value as sensitive. This isn't a new rule — it's the project's existing "API keys are stored securely and never exposed in logs or UI" success criterion, applied to a new code path that's easy to get wrong exactly because it's new.

## Files Created

| File | Purpose |
|---|---|
| `app/api/cli/keys/sync/route.ts` | The new route |
| `lib/cli/keys.ts` | `syncApiKeyForUser()` — upsert logic |

## Files Modified

| File | Change |
|---|---|
| `lib/cli/schemas.ts` | Add `keySyncSchema` |

## Key Decisions

- **New `syncApiKeyForUser`, not a reuse of `addApiKey`** — `addApiKey` is insert-only and would collide with the `(userId, provider)` unique constraint on a second sync. The new function's `onConflictDoUpdate` handles both "first time syncing this provider" and "refreshing a previously-synced provider's key" through the same call, matching how `connectRepoForUser` already upserts repos in Feature 14.
- **`isDefault` only set on a genuine first-ever key, never touched on update** — this is the concrete implementation of "add the key, don't override the active one." A user who's deliberately activated a different provider in the dashboard keeps that choice no matter how many times the CLI syncs.
- **Model validated against `PROVIDERS`, not passed through** — closes the gap where a CLI model id KOINCODE-Review's own UI wouldn't recognize could otherwise get written into `model`, which the AI SDK provider factory would then be handed verbatim.
- **Reuses `EVENTS.API_KEY_ADDED`** rather than introducing a new event constant — the CLI-vs-dashboard distinction is carried by the `source: "cli"` property, same pattern already used for `REPO_CONNECTED`/`REPO_DISCONNECTED` in Feature 14, rather than doubling the event list for every entry point.

## Open Questions / Deferred

- **No sync-side "remove a key"** — matches the CLI-side spec's decision to keep this additive-only; removing a synced key means using the existing Settings page `deleteApiKey` action directly.
- **OpenRouter-fallback models** (a direct-provider model reachable only via the CLI's OpenRouter key) — out of scope; see the CLI-side spec's Decision section for why.
