import { OpenAI } from "openai";
import { init, LLMClassifierFromTemplate } from "autoevals";

import type { ReviewResponse } from "@/lib/ai/review";
import type { EvalScorer } from "braintrust";
import type { ReviewFixture } from "./fixtures";

init({
  client: new OpenAI({
    apiKey: process.env.BRAINTRUST_API_KEY,
    baseURL: "https://api.braintrust.dev/v1/proxy",
  }),
  defaultModel: { completion: "gpt-4o-mini" },
});

const CHOICE_SCORES = { Yes: 1, Partial: 0.5, No: 0 };

type ReviewOutput = Pick<ReviewResponse, "summary" | "comments">;

function formatReviewForJudge(output: ReviewOutput): string {
  if (output.comments.length === 0) {
    return `Summary: ${output.summary}\n\n(No inline comments were made.)`;
  }

  const comments = output.comments
    .map((c, i) => {
      const suggestion = c.suggestion
        ? `\n   Suggested fix:\n   ${c.suggestion.split("\n").join("\n   ")}`
        : "";
      return `${i + 1}. ${c.path}:${c.line} — ${c.body}${suggestion}`;
    })
    .join("\n\n");

  return `Summary: ${output.summary}\n\nInline comments:\n${comments}`;
}

const specificityClassifier = LLMClassifierFromTemplate<{ code: string }>({
  name: "specificity",
  useCoT: true,
  choiceScores: CHOICE_SCORES,
  promptTemplate: `You are grading a code review for specificity.

Code diff under review:
{{code}}

Review to grade:
{{output}}

Does the review reference exact variable names, function names, or file/line locations from the diff, rather than vague generalities like "consider improving error handling"?

Yes: every comment is grounded in specific identifiers or lines from the diff.
Partial: some comments are specific, others are vague.
No: comments are generic and could apply to almost any code.`,
});

const actionabilityClassifier = LLMClassifierFromTemplate<{ code: string }>({
  name: "actionability",
  useCoT: true,
  choiceScores: CHOICE_SCORES,
  promptTemplate: `You are grading a code review for actionability.

Code diff under review:
{{code}}

Review to grade:
{{output}}

Does the review tell the developer exactly what to change, ideally with a concrete suggested fix, rather than just naming a problem?

Yes: comments include a clear fix or precise instruction.
Partial: the problem is identified but the fix is vague or missing.
No: comments describe a concern without saying what to do about it.`,
});

const accuracyClassifier = LLMClassifierFromTemplate<{
  code: string;
  expectedIssue: string;
}>({
  name: "accuracy",
  useCoT: true,
  choiceScores: CHOICE_SCORES,
  promptTemplate: `You are grading a code review for accuracy against a known issue.

Code diff under review:
{{code}}

Known issue planted in this diff (ground truth, not shown to the reviewer):
{{expectedIssue}}

Review to grade:
{{output}}

Does the review correctly flag the known issue, without inventing unrelated problems that don't exist in the diff?

Yes: the known issue is flagged and the review doesn't fabricate issues.
Partial: the known issue is flagged but the review also includes clearly incorrect claims, or the issue is only partially/vaguely captured.
No: the known issue is missed entirely.`,
});

export const specificity: EvalScorer<
  ReviewFixture,
  ReviewOutput,
  void
> = async ({ input, output }) => {
  return specificityClassifier({ output: formatReviewForJudge(output), code: input.diff });
};

export const actionability: EvalScorer<
  ReviewFixture,
  ReviewOutput,
  void
> = async ({ input, output }) => {
  return actionabilityClassifier({ output: formatReviewForJudge(output), code: input.diff });
};

export const accuracy: EvalScorer<
  ReviewFixture,
  ReviewOutput,
  void
> = async ({ input, output }) => {
  return accuracyClassifier({
    output: formatReviewForJudge(output),
    code: input.diff,
    expectedIssue: input.expectedIssue,
  });
};
