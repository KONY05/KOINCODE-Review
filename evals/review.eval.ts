import { config } from "dotenv";

config({ path: ".env.local" });

import { Eval } from "braintrust";

import { runReview } from "@/lib/ai/review";
import { reviewFixtures } from "./fixtures";
import { specificity, actionability, accuracy } from "./scorers";

const EVAL_MODEL = "gemini-2.5-flash";

Eval("koincode-review", {
  experimentName: `review-quality-${EVAL_MODEL}`,
  data: reviewFixtures.map((fixture) => ({
    input: fixture,
  })),
  task: async (fixture) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY is required to run evals (reuses the platform embedding key)."
      );
    }

    const result = await runReview({
      provider: "google",
      model: EVAL_MODEL,
      apiKey,
      prTitle: fixture.prTitle,
      headBranch: fixture.headBranch,
      baseBranch: fixture.baseBranch,
      filesChanged: Object.keys(fixture.fileContents).length,
      codebaseContext: [],
      fileContents: new Map(Object.entries(fixture.fileContents)),
      diff: fixture.diff,
    });

    return { summary: result.response.summary, comments: result.response.comments };
  },
  scores: [specificity, actionability, accuracy],
  metadata: { model: EVAL_MODEL, provider: "google" },
});
