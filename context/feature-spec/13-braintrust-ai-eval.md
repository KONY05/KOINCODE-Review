# Feature 13: Braintrust AI Eval Integration

## Overview

Log every AI review generation to Braintrust so review quality can be scored, compared across prompts/models, and tracked over time — complementing Mixpanel's feature-engagement signal with a direct signal on output quality.

## Why

Mixpanel tells you whether users engage with reviews (adoption rate, feature funnel). It does not tell you whether the AI output itself is any good. A review could have zero adoptions because:
- The suggestions were bad (bad quality)
- The code was already correct (good quality — nothing to fix)
- The user ignored GitHub entirely (engagement problem, not quality)

Braintrust closes this gap by giving you:
- Structured logging of every LLM prompt + response
- Scoring: manual scores, rubric-based, or LLM-as-judge (e.g. "are these comments specific and actionable?")
- Experiment tracking: compare prompt A vs prompt B across real PRs and see which scores better
- Score trends over time so prompt or model changes show measurable improvement or regression

The key insight: adoption rate (from Feature 12) can be fed back into Braintrust as a passive quality score — no manual scoring needed. A review where the user adopted suggestions has a demonstrably higher quality signal than one they ignored.

## Implementation Plan

### 1. Install SDK

```bash
pnpm add braintrust
```

New env var:
```
BRAINTRUST_API_KEY=   # Braintrust project API key
```

### 2. Log Review Generations

In `processReview` (`lib/inngest/functions.ts`), after `runReview()` succeeds, log the trace to Braintrust using the `reviewId` as the external ID:

```ts
import { initLogger, wrapTraced } from "braintrust";

const logger = initLogger({
  projectName: "koincode-review",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

logger.log({
  id: reviewId,           // external ID — used to update the score later
  input: {
    prTitle,
    diff,
    repoMemories,
    fileCount: prFiles.length,
  },
  output: {
    summary: result.response.summary,
    comments: result.response.comments,
  },
  metadata: {
    provider: config.provider,
    model: config.model,
    repoId,
    prNumber,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    durationMs: result.durationMs,
  },
});
```

Wrap in try/catch — Braintrust logging must never break the review pipeline.

### 3. Feed Adoption Rate Back as a Score

In `trackAdoptionSummary` (`lib/inngest/functions.ts`), after computing the adoption rate for a review, update the Braintrust trace with a quality score:

```ts
logger.log({
  id: review.id,          // same reviewId as when it was logged
  scores: {
    adoption_rate: adopted / comments.length,  // 0.0 – 1.0
  },
});
```

This links real-world user behaviour back to the exact prompt + output that generated it. Over time, you can see whether prompt changes improve the adoption rate.

### 4. Later: LLM-as-Judge Scorer

Once baseline data exists, add an automated scorer that asks a second LLM to rate each comment for:
- **Specificity** — does it reference exact variable/function names?
- **Actionability** — does it tell the developer exactly what to change?
- **Accuracy** — is the flagged issue a real problem?

This runs as a separate Inngest function triggered after each review completes, so it doesn't block the pipeline.

## Key Design Decisions

- **`reviewId` as external ID** — Braintrust traces are identified by the review's DB UUID. This allows updating scores later (adoption data arrives on merge, not at generation time) without re-logging the full trace.
- **Input pruning** — do not log full `fileContents` (too large, too expensive). Log `diff`, `prTitle`, `repoMemories`, and `fileCount` as a proxy for context size.
- **Non-blocking** — all Braintrust calls are wrapped in try/catch. A Braintrust outage must not affect review delivery.
- **Passive scoring first** — adoption rate as a score requires zero manual effort and is grounded in real user behaviour. LLM-as-judge comes later once you need finer-grained signal.

## New Env Vars

```
BRAINTRUST_API_KEY=   # Braintrust project API key
```
