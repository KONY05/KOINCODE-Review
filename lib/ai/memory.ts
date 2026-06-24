import { generateText, Output } from "ai";
import { z } from "zod/v4";

import { createLLMProvider } from "./providers";
import type { LlmProvider } from "@/lib/db/schema/api-keys";

const ruleExtractionSchema = z.object({
  rule: z.nullable(z.string()),
});

const EXTRACT_RULE_SYSTEM_PROMPT = `You extract coding rules and preferences from conversations between a code reviewer and a developer.

Given the original review comment and the developer's reply, extract a single concise rule that should apply to future reviews of this codebase.

Rules:
- The rule must be one sentence, under 280 characters.
- Write it as a directive: "Prefer X over Y", "Always do X", "Never do Y", "Ignore X in Y context".
- If the reply is not teaching a rule (e.g., just saying "thanks", "fixed", "good catch", or acknowledging the review), return null.
- If the reply is asking a question rather than stating a preference, return null.`;

export type ExtractRuleResult = {
  rule: string | null;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
};

export async function extractRule(params: {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  originalComment: string;
  userReply: string;
}): Promise<ExtractRuleResult> {
  const llmProvider = createLLMProvider(params.provider, params.apiKey);

  const startTime = Date.now();

  let result;
  try {
    result = await generateText({
      model: llmProvider(params.model),
      output: Output.object({ schema: ruleExtractionSchema }),
      system: EXTRACT_RULE_SYSTEM_PROMPT,
      prompt:
        `## Original review comment\n${params.originalComment}\n\n` +
        `## Developer's reply\n${params.userReply}`,
      maxOutputTokens: 256,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AI_NoOutputGeneratedError") {
      const durationMs = Date.now() - startTime;
      return { rule: null, usage: { inputTokens: 0, outputTokens: 0 }, durationMs };
    }
    throw error;
  }

  const durationMs = Date.now() - startTime;

  const usage = {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };

  let output: z.infer<typeof ruleExtractionSchema> | null;
  try {
    output = result.output;
  } catch {
    return { rule: null, usage, durationMs };
  }

  const rule = output?.rule;
  if (!rule || rule.length > 280) return { rule: null, usage, durationMs };

  return { rule, usage, durationMs };
}
