# Feature 19: Semantic Related-PR Matching + LLM-Authored Reasons

> Numbering note: `feature/multi-provider-support` independently uses 16–22 for its own specs. Numbers on that branch and this one are not a shared sequence — see the Feature 18 collision already recorded in `progress-tracker.md`. Reconcile when that branch merges.

## Overview

Feature 18 ships related-PR detection via GitHub commit history + file-path overlap, with a static `reason` string. This feature layers a semantic path on top: index each reviewed PR into Pinecone, retrieve candidates by similarity against the incoming PR, and let the review LLM decide which candidates are genuinely related and write the reason in prose — the CodeRabbit-quality phrasing Feature 18 explicitly deferred ("Introduces the original `helloWorld` function... which this PR updates").

Two capabilities Feature 18 structurally cannot provide:

1. **Relation without file overlap.** File-path matching only finds PRs touching the *same files*. A PR that reworks the same feature area in different files is invisible to it. Similarity search catches it.
2. **Reasons grounded in content.** A static heuristic can only restate the overlap it matched on. The LLM, given the candidate PR's actual description, can say what the relationship *is*.

Feature 18 is **not replaced** — it becomes the fallback for the cold-start window (see §4).

## Current State (confirmed by reading the code)

- Pinecone holds **file chunks only**. Metadata written at `lib/vector/indexing.ts:48-54` is `{ repoId, filePath, fileType, chunkIndex, text }`; vector IDs are `${repoId}:${file.path}:${chunk.chunkIndex}`. Nothing PR-shaped is stored, so the existing namespace cannot answer "which PR is related" — this feature adds new records rather than querying existing ones differently.
- `indexChangedFiles` (`lib/vector/indexing.ts:64-77`) deletes every chunk for a path before re-indexing, so the store holds only each file's **current** state. There is no history in it at all.
- One namespace per repo today: `repo:{repoId}` (`indexing.ts:29`, `retrieval.ts:28`). `cleanupDisconnectedRepos` (`lib/inngest/functions.ts:196`) deletes exactly that one namespace on purge.
- `retrieveContext()` (`lib/vector/retrieval.ts:19-49`) is the existing query path — embed a query string, `topK` search with `MIN_SCORE = 0.7`, map matches to `{ filePath, text, score }`. The new PR query is a sibling of this, not a modification of it.
- `generateEmbeddings()` (`lib/vector/embeddings.ts:47-72`) takes `texts: string[]` and an optional user Google key, returning embeddings + token usage. `chunkText()` only splits above `MAX_CHUNK_SIZE = 4000` chars — PR descriptions land well under that, so PR records need no chunking.
- Feature 18's `description` field (`reviewResponseSchema`, `lib/ai/review.ts:15-19`) is a contributor-voiced "what this PR does and why" — already exactly the text worth embedding for semantic PR matching. No new LLM output is needed to *build* the index.
- `find-related-prs` (`lib/inngest/functions.ts:553-569`) currently runs **after** `run-review`, which is fine for a static reason but wrong for an LLM-authored one — see §3.

## Design

### 1. PR-record namespace

A second namespace per repo, `repo:{repoId}:prs`, holding **one vector per reviewed PR** (not per chunk):

```ts
// lib/vector/pr-index.ts (new)
type PRVectorRecord = {
  id: string; // `${repoId}:pr:${prNumber}`
  values: number[];
  metadata: {
    repoId: string;
    prNumber: number;
    title: string;
    url: string;
    text: string; // the embedded description + walkthrough
  };
};

export async function indexReviewedPR(
  repoId: string,
  pr: { number: number; title: string; url: string; description: string; walkthrough: { path: string; change: string }[] },
  googleApiKey?: string
): Promise<IndexingUsage>;
```

Embedded text is `title` + `description` + the walkthrough's `change` sentences joined — the semantic fingerprint of what the PR did. Deliberately **not** the raw diff: diffs are mostly syntax noise, and the walkthrough is already an LLM-distilled summary of the same information.

The ID is keyed on `prNumber`, so a re-review (`synchronize`) upserts over the previous record instead of accumulating duplicates — same idempotency property `indexChangedFiles` gets from its delete-then-write.

### 2. Indexing on review completion

New step in `processReview`, after `save-review` (`functions.ts:608-633`), where `reviewData.response.description`/`walkthrough` and the PR metadata are all already in scope:

```ts
await step.run("index-reviewed-pr", async () => {
  try {
    const usage = await indexReviewedPR(repoId, {...}, googleApiKey);
    await logKeyUsage({ /* action: "embedding", ... */ });
  } catch (error) {
    console.error("Failed to index PR for semantic matching:", error);
  }
});
```

Non-fatal, and usage-logged through the existing `logKeyUsage` path with `action: "embedding"` like every other embedding call in the pipeline.

**PR state handling** — the PR is still *open* when we index it, so unlike Feature 19 we can't filter on `merged_at` at write time. Rather than a second pass to confirm merges, records are written on review and **deleted when a PR closes unmerged**, via the `closed` webhook action the handler already processes for Feature 10's cancellation path. Net effect: open and merged PRs stay eligible, abandoned ones drop out.

This is a **deliberate divergence from Feature 19's merged-only rule**, not an oversight. Feature 19 filters to merged because `listPullRequestsAssociatedWithCommit` returns PRs with no causal link to the commit being in the base branch — filtering there is about *correctness*. Here every record is a PR we actually reviewed, so an open one is a true signal, and often a more useful one: "someone is changing this same area right now" is worth surfacing to a reviewer.

### 3. Retrieval must move before `run-review`

For the model to author the reason, candidates have to be in the prompt — so retrieval moves from its current post-review position into the `run-review` step, alongside the existing `retrieveContext()` call (`functions.ts:436-440`) which already does exactly this kind of query:

```ts
const relatedPRCandidates = await retrieveRelatedPRVectorCandidates(
  repoId,
  buildRelatedPRQuery(prTitle, reviewableFiles, diff),
  prNumber, // excluded via Pinecone metadata filter { prNumber: { $ne: prNumber } }
  googleApiKey
);
```

`buildRelatedPRQuery()` is a sibling of the existing `buildContextQuery()` (`retrieval.ts:51-56`): PR title + changed file paths + a **bounded diff excerpt** (first ~2000 chars). Bounded because embedding input is capped anyway and a large diff would push the signal-carrying title/paths out of the window.

The existing `find-related-prs` step is **removed** — its `fetchRelatedPRs()` call relocates into `run-review` as the fallback below.

### 4. Fallback, not replacement

```
query repo:{repoId}:prs
  ├─ ≥1 hit above MIN_SCORE  → use as candidates
  └─ 0 hits (cold start)      → fetchRelatedPRs() from Feature 19
```

A repo connected before this ships has an empty PR namespace and stays that way until it accumulates reviews, so without the fallback the feature would silently do nothing for every existing user. Feature 19's GitHub-history path has no cold start — it reads history that already exists — which is exactly what makes it the right floor to land on.

Fallback candidates carry `title` but no `description`, so the model has thinner material to write a reason from. Acceptable and worth stating plainly: reasons will be weaker on that path, closer to Feature 19's static phrasing.

### 5. LLM output shape — numbers and reasons only

`reviewResponseSchema` (`lib/ai/review.ts`) gains:

```ts
relatedPRs: z.array(
  z.object({
    number: z.number().describe("PR number, taken verbatim from the Possibly Related PRs candidates section. Never invent a number that isn't listed there."),
    reason: z.string().describe("One sentence on how that PR relates to this one — what it changed that this PR builds on, revisits, or conflicts with."),
  })
).describe("Candidates that are genuinely related. Return an empty array if none are — do not pad this list."),
```

**The model returns `number` and `reason` only — never `url` or `title`.** Those are rehydrated from the candidate list we retrieved, and any `number` not present in that list is dropped at the merge step. This is what makes hallucinated links structurally impossible rather than merely unlikely: the model cannot emit a URL, so it cannot emit a wrong one.

`PromptParams` (`lib/ai/prompts.ts:1-20`) gains `relatedPRCandidates?: { number, title, url, description?, matchedFiles?: string[] }[]`, rendered as a new prompt section, plus a `REVIEW_SYSTEM_PROMPT` part covering the "only genuinely related, empty array is fine, never invent numbers" rules.

The rendering in `buildReviewBody()` (`lib/github/comments.ts`) is **unchanged** — it already takes `RelatedPR[]` with a `reason` string and doesn't care who wrote it.

### 6. Namespace cleanup

`cleanupDisconnectedRepos` (`functions.ts:196`) currently deletes one namespace; it must delete both:

```ts
await deleteNamespace(`repo:${repo.id}`);
await deleteNamespace(`repo:${repo.id}:prs`);
```

Without this, purging a disconnected repo leaves its PR vectors orphaned in Pinecone forever.

## Schema/Type Changes Needed

- `lib/vector/pr-index.ts` (new) — `indexReviewedPR()`, `retrieveRelatedPRVectorCandidates()`, `deleteIndexedPR()`.
- `buildRelatedPRQuery()` in `lib/vector/retrieval.ts`.
- `reviewResponseSchema.relatedPRs` (`lib/ai/review.ts`); `PromptParams.relatedPRCandidates` + prompt section + system-prompt rules (`lib/ai/prompts.ts`).
- `processReview`: `find-related-prs` step removed, retrieval folded into `run-review`, new `index-reviewed-pr` step after `save-review`.
- Webhook `closed` handler: dispatch PR-vector deletion when `merged === false`.
- `cleanupDisconnectedRepos`: delete the `:prs` namespace too.
- No database schema changes — `relatedPRs` stays unpersisted, consistent with `walkthrough`/`diagram`/Feature 19.

## Cost

Per review: **+1 embedding call** to index, **+1** to query — replacing Feature 19's up-to-20 GitHub API calls on the warm path. Prompt grows by the candidate section (a few hundred tokens at 3 candidates). Both embedding calls go through the existing user-key-else-platform-key strategy and are usage-logged.

Net: cheaper in API calls, marginally more expensive in LLM tokens, and the GitHub calls only come back on cold-start repos.

## Explicitly Out of Scope

- **Cross-repo matching** — unchanged from Feature 19. The namespace is per-repo by construction; querying across a user's repos is a separate feature.
- **Backfilling historical PRs into the index** — the namespace fills going forward, with Feature 19 covering the gap. A backfill job (walk closed PRs, generate descriptions, embed) would need an LLM call per historical PR against a BYOK key, which is not a cost to incur without the user asking for it.
- **Re-ranking or a similarity threshold distinct from `MIN_SCORE = 0.7`** — reuse the existing constant until there's evidence PR-level similarity needs different tuning than chunk-level.
