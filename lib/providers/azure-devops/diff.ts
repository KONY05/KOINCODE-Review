import type { PRFile } from "../types";
import { shouldSkipFile } from "../diff-utils";
import { azureFetch, splitOwner } from "./client";
import { fetchFileContent } from "./files";
import { computeUnifiedDiff } from "./local-diff";

type AzurePullRequest = {
  pullRequestId: number;
  lastMergeSourceCommit: { commitId: string };
};

type AzureIteration = {
  id: number;
  sourceRefCommit: { commitId: string };
  targetRefCommit: { commitId: string };
  // Only present on newer API versions — the actual merge-base commit,
  // preferred over targetRefCommit (the target branch's tip, not the base)
  // when available.
  commonRefCommit?: { commitId: string };
};

type AzureChangeEntry = {
  item: { path: string; isFolder?: boolean };
  changeType: string;
  originalPath?: string;
};

function stripLeadingSlash(path: string): string {
  return path.replace(/^\//, "");
}

function statusFromChangeType(changeType: string): PRFile["status"] {
  if (changeType.includes("add")) return "added";
  if (changeType.includes("delete")) return "removed";
  if (changeType.includes("rename")) return "renamed";
  return "modified";
}

async function fetchLatestIteration(
  token: string,
  organization: string,
  encodedProject: string,
  encodedRepo: string,
  prNumber: number,
): Promise<AzureIteration> {
  const { value: iterations } = await azureFetch<{ value: AzureIteration[] }>(
    token,
    `/${organization}/${encodedProject}/_apis/git/repositories/${encodedRepo}/pullRequests/${prNumber}/iterations`,
  );

  const latest = iterations[iterations.length - 1];
  if (!latest) throw new Error(`Azure DevOps PR ${prNumber} has no iterations`);
  return latest;
}

// Memoizes buildChangedFiles's in-flight promise per (owner, repo, prNumber).
// fetchPRFiles and fetchPRDiff below do the exact same content-fetch +
// local-diff fan-out — GitHub/GitLab don't need this since their two calls
// hit cheap, separate provider endpoints, but Azure DevOps has neither, so
// without this the same work runs twice for every review (they're always
// called together via Promise.all in lib/inngest/functions.ts's
// processReview). Keyed on the in-flight promise itself, not the resolved
// value, so the second concurrent caller awaits the same request instead of
// starting its own. Entries are evicted shortly after settling — a warm
// serverless instance could otherwise serve stale data to a later, unrelated
// review of the same PR number after a new push.
const inFlightChangedFiles = new Map<string, Promise<PRFile[]>>();
const CACHE_EVICTION_DELAY_MS = 5_000;

async function buildChangedFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRFile[]> {
  const cacheKey = `${owner}/${repo}/${prNumber}`;
  const cached = inFlightChangedFiles.get(cacheKey);
  if (cached) return cached;

  const promise = fetchChangedFiles(token, owner, repo, prNumber);
  inFlightChangedFiles.set(cacheKey, promise);

  // .catch() here only silences this specific chain's duplicate
  // unhandled-rejection warning — the `promise` returned below (and cached
  // above) still carries the real rejection to fetchPRFiles/fetchPRDiff's
  // callers untouched.
  promise
    .finally(() => {
      setTimeout(() => {
        if (inFlightChangedFiles.get(cacheKey) === promise) {
          inFlightChangedFiles.delete(cacheKey);
        }
      }, CACHE_EVICTION_DELAY_MS);
    })
    .catch(() => {});

  return promise;
}

async function fetchChangedFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRFile[]> {
  const { organization, project } = splitOwner(owner);
  const encodedProject = encodeURIComponent(project);
  const encodedRepo = encodeURIComponent(repo);

  const iteration = await fetchLatestIteration(token, organization, encodedProject, encodedRepo, prNumber);

  const baseSha = iteration.commonRefCommit?.commitId ?? iteration.targetRefCommit.commitId;

  const headSha = iteration.sourceRefCommit.commitId;

  const { changeEntries } = await azureFetch<{ changeEntries: AzureChangeEntry[] }>(
    token,
    `/${organization}/${encodedProject}/_apis/git/repositories/${encodedRepo}/pullRequests/${prNumber}/iterations/${iteration.id}/changes`,
  );

  const results = await Promise.allSettled(
    changeEntries
      .filter((c) => !c.item.isFolder)
      .map(async (c): Promise<PRFile | null> => {
        const path = stripLeadingSlash(c.item.path);
        if (shouldSkipFile(path)) return null;

        const status = statusFromChangeType(c.changeType);
        const oldPath = c.originalPath ? stripLeadingSlash(c.originalPath) : path;

        const [oldContent, newContent] = await Promise.all([
          status === "added" ? Promise.resolve("") : fetchFileContent(token, owner, repo, oldPath, baseSha),
          status === "removed" ? Promise.resolve("") : fetchFileContent(token, owner, repo, path, headSha),
        ]);

        // Content missing where it should exist (too large, or a race with
        // the item having changed again) — skip rather than fabricate a
        // misleading full add/remove diff from an empty placeholder.
        if (oldContent === null || newContent === null) return null;

        const { patch, additions, deletions } = computeUnifiedDiff(path, oldContent, newContent);

        return { filename: path, status, additions, deletions, patch };
      }),
  );

  const files: PRFile[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) files.push(result.value);
  }
  
  return files;
}

export async function fetchPRFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRFile[]> {
  return buildChangedFiles(token, owner, repo, prNumber);
}

export async function fetchPRDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const files = await buildChangedFiles(token, owner, repo, prNumber);
  return files.map((f) => f.patch).filter(Boolean).join("\n");
}

export async function fetchPRHeadSha(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const { organization, project } = splitOwner(owner);
  const pr = await azureFetch<AzurePullRequest>(
    token,
    `/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prNumber}`,
  );
  return pr.lastMergeSourceCommit.commitId;
}
