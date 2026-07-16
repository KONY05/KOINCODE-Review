import { Octokit } from "@octokit/rest";

import type { PRFile } from "../types";

const SKIP_PATTERNS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.min\.(js|css)$/,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/,
];

function shouldSkipFile(filename: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filename));
}

export async function fetchPRFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRFile[]> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return data
    .filter((file) => !shouldSkipFile(file.filename))
    .map((file) => ({
      filename: file.filename,
      status: file.status as PRFile["status"],
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
    }));
}

export async function fetchPRDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });

  return data as unknown as string;
}

/**
 * Fetches the PR's current head SHA. Called alongside fetchPRFiles/fetchPRDiff
 * so a review run has one commit it can pin file-content fetches, commit
 * statuses, and posted comments to — instead of trusting a SHA captured
 * earlier from a webhook payload, which may no longer be the head.
 */
export async function fetchPRHeadSha(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return data.head.sha;
}
