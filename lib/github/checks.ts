import { Octokit } from "@octokit/rest";

type CommitState = "pending" | "success" | "failure" | "error";

type CommitStatusParams = {
  state: CommitState;
  description: string;
  targetUrl?: string;
};

const STATUS_CONTEXT = "KoinCode Review";

export async function createCommitStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  params: CommitStatusParams
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  await octokit.repos.createCommitStatus({
    owner,
    repo,
    sha,
    state: params.state,
    description: params.description.slice(0, 140),
    target_url: params.targetUrl,
    context: STATUS_CONTEXT,
  });
}
