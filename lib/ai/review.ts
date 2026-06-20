import { generateText, Output } from "ai";
import { z } from "zod/v4";

import { createLLMProvider } from "./providers";
import { REVIEW_SYSTEM_PROMPT, buildReviewPrompt } from "./prompts";
import type { LlmProvider } from "@/lib/db/schema/api-keys";

const walkthroughEntrySchema = z.object({
  path: z.string(),
  change: z.string(),
});

const reviewResponseSchema = z.object({
  summary: z.string(),
  walkthrough: z.array(walkthroughEntrySchema),
  diagram: z.string().optional(),
  comments: z.array(
    z.object({
      path: z.string(),
      line: z.number(),
      body: z.string(),
      suggestion: z.string().optional(),
    })
  ),
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

type RunReviewParams = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  prTitle: string;
  headBranch: string;
  baseBranch: string;
  filesChanged: number;
  codebaseContext: { filePath: string; text: string }[];
  fileContents: Map<string, string>;
  diff: string;
};

export async function runReview(params: RunReviewParams): Promise<ReviewResponse> {
  const llmProvider = createLLMProvider(params.provider, params.apiKey);

  const userPrompt = buildReviewPrompt({
    prTitle: params.prTitle,
    headBranch: params.headBranch,
    baseBranch: params.baseBranch,
    filesChanged: params.filesChanged,
    codebaseContext: params.codebaseContext,
    fileContents: params.fileContents,
    diff: params.diff,
  });

  const result = await generateText({
    model: llmProvider(params.model),
    output: Output.object({ schema: reviewResponseSchema }),
    system: REVIEW_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: 4096,
  });

  if (!result.output) {
    throw new Error("LLM returned no structured output");
  }

  return result.output;
}
