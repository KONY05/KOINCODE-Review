import type { CommitStatusParams } from "../types";
import { STATUS_NAME } from "../constants";
import { gitlabFetch, projectPath } from "./client";

// GitLab's commit-status vocabulary differs from GitHub's: no "error" state
// (folded into "failed"), and an extra "running" state we never emit.
type GitlabState = "pending" | "running" | "success" | "failed" | "canceled";

function mapState(state: CommitStatusParams["state"]): GitlabState {
  switch (state) {
    case "pending":
      return "pending";
    case "success":
      return "success";
    case "failure":
    case "error":
      return "failed";
  }
}

export async function createCommitStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  params: CommitStatusParams,
): Promise<void> {
  const id = projectPath(owner, repo);

  const query = new URLSearchParams({
    state: mapState(params.state),
    description: params.description.slice(0, 255),
    name: STATUS_NAME,
  });
  if (params.targetUrl) query.set("target_url", params.targetUrl);

  await gitlabFetch<unknown>(
    token,
    `/projects/${id}/statuses/${sha}?${query.toString()}`,
    {
      method: "POST",
    },
  );
}
