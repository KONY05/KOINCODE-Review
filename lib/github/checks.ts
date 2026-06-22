import { Octokit } from "@octokit/rest";

type CheckRunConclusion = "success" | "failure" | "neutral";

type CompleteCheckRunParams = {
  conclusion: CheckRunConclusion;
  title: string;
  summary: string;
};

export async function createCheckRun(
  token: string,
  owner: string,
  repo: string,
  headSha: string
): Promise<number> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.checks.create({
    owner,
    repo,
    name: "KoinCode Review",
    head_sha: headSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
    output: {
      title: "Review in progress",
      summary: "Analyzing your pull request...",
    },
  });

  return data.id;
}

export async function completeCheckRun(
  token: string,
  owner: string,
  repo: string,
  checkRunId: number,
  result: CompleteCheckRunParams
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  await octokit.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: "completed",
    conclusion: result.conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: result.title,
      summary: result.summary,
    },
  });
}
