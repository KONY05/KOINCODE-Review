import { initLogger } from "braintrust";

import type { ReviewResponse } from "@/lib/ai/review";
import type { LlmProvider } from "@/lib/db/schema/api-keys";

let logger: ReturnType<typeof initLogger> | null = null;

function getLogger() {
  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (!apiKey) return null;
  if (logger) return logger;

  logger = initLogger({ projectName: "koincode-review", apiKey });
  return logger;
}

type ReviewGenerationLog = {
  reviewId: string;
  prTitle: string;
  diff: string;
  repoMemories: string[];
  fileCount: number;
  response: Pick<ReviewResponse, "summary" | "comments">;
  provider: LlmProvider;
  model: string;
  repoId: string;
  prNumber: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

export async function logReviewGeneration(params: ReviewGenerationLog) {
  const client = getLogger();
  if (!client) return;

  try {
    client.log({
      id: params.reviewId,
      input: {
        prTitle: params.prTitle,
        diff: params.diff,
        repoMemories: params.repoMemories,
        fileCount: params.fileCount,
      },
      output: {
        summary: params.response.summary,
        comments: params.response.comments,
      },
      metadata: {
        provider: params.provider,
        model: params.model,
        repoId: params.repoId,
        prNumber: params.prNumber,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        durationMs: params.durationMs,
      },
    });
    await client.flush();
  } catch {
    // non-fatal — Braintrust logging must never break the review pipeline
  }
}

export async function logAdoptionScore(reviewId: string, adoptionRate: number) {
  const client = getLogger();
  if (!client) return;

  try {
    client.logFeedback({
      id: reviewId,
      scores: { adoption_rate: adoptionRate },
    });
    await client.flush();
  } catch {
    // non-fatal — Braintrust logging must never break the pipeline
  }
}
