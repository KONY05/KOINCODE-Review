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
      startLine: z
        .number()
        .optional()
        .describe(
          "First line of the problematic range. Omit for single-line issues. Must point to the actual problematic code — never a surrounding function/class/block declaration."
        ),
      line: z
        .number()
        .describe(
          "Last line of the problematic range (or the single line, if startLine is omitted). Counted from the numbered Full File Contents section."
        ),
      body: z
        .string()
        .describe("Explanation of the issue. Be specific and actionable."),
      suggestion: z
        .string()
        .optional()
        .describe(
          "Complete replacement for lines startLine..line inclusive, and nothing else. Must contain ONLY the corrected code — never the original code, never both original and fixed, never lines outside startLine..line. Empty string means delete the range entirely. Omit if there's no code fix to suggest."
        ),
    })
  ),
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export type ReviewResult = {
  response: ReviewResponse;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
};

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
  repoMemories?: string[];
};

export async function runReview(params: RunReviewParams): Promise<ReviewResult> {
  const llmProvider = createLLMProvider(params.provider, params.apiKey);

  const userPrompt = buildReviewPrompt({
    prTitle: params.prTitle,
    headBranch: params.headBranch,
    baseBranch: params.baseBranch,
    filesChanged: params.filesChanged,
    codebaseContext: params.codebaseContext,
    fileContents: params.fileContents,
    diff: params.diff,
    repoMemories: params.repoMemories,
  });

  const startTime = Date.now();

  const result = await generateText({
    model: llmProvider(params.model),
    output: Output.object({ schema: reviewResponseSchema }),
    system: REVIEW_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: 4096,
  });

  const durationMs = Date.now() - startTime;

  if (!result.output) {
    throw new Error("LLM returned no structured output");
  }

  return {
    response: result.output,
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
    durationMs,
  };
}
