import { Octokit } from "@octokit/rest";

import type { CommitStatusParams } from "../types";
import { STATUS_NAME } from "../constants";

export async function createCommitStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  params: CommitStatusParams,
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  await octokit.repos.createCommitStatus({
    owner,
    repo,
    sha,
    state: params.state,
    description: params.description.slice(0, 140),
    target_url: params.targetUrl,
    context: STATUS_NAME,
  });
}
