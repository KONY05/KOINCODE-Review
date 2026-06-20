type PromptParams = {
  prTitle: string;
  headBranch: string;
  baseBranch: string;
  filesChanged: number;
  codebaseContext: { filePath: string; text: string }[];
  fileContents: Map<string, string>;
  diff: string;
  repoMemories?: string[];
};

export const REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer. Review the pull request diff and produce a structured response with four parts:

## 1. Summary
A brief 1-3 sentence overview of what this PR does and its overall quality.

## 2. Walkthrough
A file-by-file breakdown of the changes. For each changed file, provide the file path and a one-sentence description of what changed and why it matters.

## 3. Sequence Diagram (optional)
If the changes involve a multi-step flow (API calls, event handling, data pipelines, request/response cycles), provide a Mermaid sequence diagram visualizing the flow. Use simple labels with no special characters (no quotes, braces, or parentheses in labels). Omit this field entirely if the changes are too simple to warrant a diagram (e.g., a config tweak or single-file refactor).

## 4. Inline Comments
Review the diff for:
- **Bugs** — logic errors, off-by-one mistakes, null/undefined access, race conditions.
- **Security issues** — injection vulnerabilities, exposed secrets, missing auth checks.
- **Performance problems** — unnecessary re-renders, N+1 queries, missing indexes, memory leaks.
- **Code quality** — unclear naming, duplicated logic, overly complex control flow.

Rules for inline comments:
- Be specific and actionable. Reference exact line numbers and variable names.
- For each issue, provide a suggested code fix when possible.
- Skip trivial style nits (formatting, semicolons, trailing commas) — linters handle those.
- Skip praise — only report issues that need attention.
- If the code looks good and has no issues, return an empty comments array.
- The "line" field must be a line number in the NEW version of the file (the + side of the diff).
- The "suggestion" field should contain the replacement code for the problematic line(s). Only include the code itself, not diff markers.`;

export function buildReviewPrompt(params: PromptParams): string {
  const sections: string[] = [];

  sections.push(
    `## Pull Request\n` +
      `- **Title:** ${params.prTitle}\n` +
      `- **Branch:** ${params.headBranch} → ${params.baseBranch}\n` +
      `- **Files changed:** ${params.filesChanged}`
  );

  if (params.repoMemories && params.repoMemories.length > 0) {
    sections.push(
      `## Repository Rules (learned from past reviews)\n\n` +
        `These are conventions and preferences specific to this codebase. Respect them in your review:\n\n` +
        params.repoMemories.map((rule) => `- ${rule}`).join("\n")
    );
  }

  if (params.codebaseContext.length > 0) {
    sections.push(
      `## Codebase Context\n\nRelevant code from the repository for additional context:\n\n` +
        params.codebaseContext
          .map((ctx) => `### ${ctx.filePath}\n\`\`\`\n${ctx.text}\n\`\`\``)
          .join("\n\n")
    );
  }

  if (params.fileContents.size > 0) {
    const fileEntries: string[] = [];
    for (const [path, content] of params.fileContents) {
      fileEntries.push(`### ${path}\n\`\`\`\n${content}\n\`\`\``);
    }
    sections.push(
      `## Full File Contents (changed files)\n\n` + fileEntries.join("\n\n")
    );
  }

  sections.push(`## Diff\n\n\`\`\`diff\n${params.diff}\n\`\`\``);

  return sections.join("\n\n");
}
