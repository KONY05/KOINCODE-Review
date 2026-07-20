import type { CommitStatusParams } from "../types";
import { STATUS_NAME } from "../constants";
import { azureFetch, splitOwner } from "./client";

// Azure DevOps's status vocabulary differs from both GitHub's and GitLab's:
// "notSet"/"notApplicable" states we never emit, and "succeeded" instead of
// "success".
type AzureState = "notSet" | "pending" | "succeeded" | "failed" | "error" | "notApplicable";

function mapState(state: CommitStatusParams["state"]): AzureState {
  switch (state) {
    case "pending":
      return "pending";
    case "success":
      return "succeeded";
    case "failure":
      return "failed";
    case "error":
      return "error";
  }
}

/**
 * Commit-scoped (not PR-scoped) — matches GitProvider's shared interface,
 * which only takes a `sha`, no prNumber. Azure DevOps also has a
 * PR-scoped statuses endpoint, but using the commit-scoped one keeps this
 * consistent with GitHub's/GitLab's implementations of the same method.
 */
export async function createCommitStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  params: CommitStatusParams,
): Promise<void> {
  const { organization, project } = splitOwner(owner);

  await azureFetch<unknown>(
    token,
    `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/commits/${sha}/statuses`,
    {
      method: "POST",
      body: JSON.stringify({
        state: mapState(params.state),
        description: params.description.slice(0, 250),
        targetUrl: params.targetUrl,
        context: { name: STATUS_NAME, genre: "koincode-review" },
      }),
    },
  );
}
