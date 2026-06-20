import { Octokit } from "@octokit/rest";

export type PRFile = {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch?: string;
};

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
