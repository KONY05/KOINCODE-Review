// Only "github" is implemented today — "gitlab" / "azure_devops" get added to
// this union in Features 18/19 alongside their GitProvider implementations,
// not speculatively here. Mirrors the git_provider Postgres enum.
export type GitProviderId = "github";

export type RemoteRepo = {
  externalId: string;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
};

export type PRFile = {
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  patch?: string;
};

export type DraftReviewComment = {
  path: string;
  startLine?: number;
  line: number;
  body: string;
  suggestion?: string;
};

export type PostedComment = {
  path: string;
  providerCommentId: string;
};

export type ReviewSummary = {
  summary: string;
  walkthrough: { path: string; change: string }[];
  diagram?: string;
};

export type CommitStatusParams = {
  state: "pending" | "success" | "failure" | "error";
  description: string;
  targetUrl?: string;
};

export type RepoFile = {
  path: string;
  content: string;
  fileType: "readme" | "config" | "source" | "tree";
};

export type ChangedRange = { start: number; end: number };

export type FileChanges = {
  filename: string;
  ranges: ChangedRange[];
};

/**
 * Everything the review pipeline needs from a git host, implemented once per
 * provider (lib/providers/github, later lib/providers/gitlab and
 * lib/providers/azure-devops) and selected at runtime via a repo's stored
 * `provider` column (see lib/providers/registry.ts). Session-scoped token
 * convenience helpers (e.g. GitHub's getGithubToken()) and provider-only
 * bonus features (e.g. GitHub's contribution graph) intentionally live
 * outside this interface — they don't generalize across providers.
 */
export type GitProvider = {
  readonly id: GitProviderId;

  getTokenForClerkUser(clerkId: string): Promise<string | null>;

  listUserRepos(
    token: string,
    page?: number,
    perPage?: number,
  ): Promise<{ repos: RemoteRepo[]; hasNextPage: boolean }>;
  fetchRepoByFullName(
    token: string,
    owner: string,
    repo: string,
  ): Promise<RemoteRepo | null>;

  createRepoWebhook(token: string, owner: string, repo: string): Promise<string>;
  deleteRepoWebhook(
    token: string,
    owner: string,
    repo: string,
    webhookId: string,
  ): Promise<void>;

  fetchRepoTree(
    token: string,
    owner: string,
    repo: string,
    defaultBranch: string,
  ): Promise<RepoFile[]>;
  fetchFileContent(
    token: string,
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null>;
  fetchChangedFileContents(
    token: string,
    owner: string,
    repo: string,
    filenames: string[],
    ref: string,
  ): Promise<Map<string, string>>;

  fetchPRFiles(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PRFile[]>;
  fetchPRDiff(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<string>;
  fetchPRHeadSha(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<string>;

  postReviewComments(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    comments: DraftReviewComment[],
    patches: Map<string, string>,
    summary: ReviewSummary,
  ): Promise<PostedComment[]>;
  replyToComment(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
    inReplyTo: string,
    body: string,
  ): Promise<void>;

  createCommitStatus(
    token: string,
    owner: string,
    repo: string,
    sha: string,
    params: CommitStatusParams,
  ): Promise<void>;

  fetchPushChanges(
    token: string,
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string,
  ): Promise<FileChanges[]>;
};
