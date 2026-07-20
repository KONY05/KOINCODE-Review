import type { FileChanges } from "../types";
import { parseHunkRanges } from "../diff-utils";
import { azureFetch, splitOwner } from "./client";
import { fetchFileContent } from "./files";
import { computeUnifiedDiff } from "./local-diff";

type AzureCommitDiffChange = { item: { path: string; isFolder?: boolean }; changeType: string };
type AzureCommitDiffResponse = { changes: AzureCommitDiffChange[] };

/**
 * Compares two commits and returns each changed file with its modified line
 * ranges — same role as GitHub's/GitLab's fetchPushChanges (adoption
 * tracking). Azure DevOps's diffs/commits endpoint gives the changed-file
 * list but no hunk-level line diffs, so ranges are computed locally the same
 * way as lib/providers/azure-devops/diff.ts's PR file diffing.
 */
export async function fetchPushChanges(
  token: string,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
): Promise<FileChanges[]> {
  const { organization, project } = splitOwner(owner);

  const data = await azureFetch<AzureCommitDiffResponse>(
    token,
    `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/diffs/commits` +
      `?baseVersion=${encodeURIComponent(baseSha)}&baseVersionType=commit&targetVersion=${encodeURIComponent(headSha)}&targetVersionType=commit`,
  );

  const results = await Promise.allSettled(
    data.changes
      .filter((c) => !c.item.isFolder && !c.changeType.includes("delete"))
      .map(async (c): Promise<FileChanges | null> => {
        const path = c.item.path.replace(/^\//, "");

        const [oldContent, newContent] = await Promise.all([
          c.changeType.includes("add") ? Promise.resolve("") : fetchFileContent(token, owner, repo, path, baseSha),
          fetchFileContent(token, owner, repo, path, headSha),
        ]);

        if (oldContent === null || newContent === null) return null;

        const { patch } = computeUnifiedDiff(path, oldContent, newContent);
        return { filename: path, ranges: parseHunkRanges(patch) };
      }),
  );

  const changes: FileChanges[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) changes.push(result.value);
  }
  return changes;
}
