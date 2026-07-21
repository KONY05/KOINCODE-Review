// Mirrors the git_provider Postgres enum.
export type GitProviderId = "github" | "gitlab" | "azure_devops";

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
 * GitHub/GitLab's createRepoWebhook always succeeds or throws — Azure DevOps
 * can't guarantee that (vso.hooks_write may not be grantable to a given
 * Entra app registration, only discoverable by the create call itself
 * 403ing). "manual" means the caller must show the user `secret` to paste
 * into the provider's own webhook UI; GitHub/GitLab only ever return
 * "created".
 */
export type CreateWebhookResult =
  | { status: "created"; webhookId: string }
  | { status: "manual"; secret: string };

/**
 * Everything the review pipeline needs from a git host, implemented once per
 * provider (lib/providers/github, lib/providers/gitlab,
 * lib/providers/azure-devops) and selected at runtime via a repo's stored
 * `provider` column (see lib/providers/registry.ts).
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

  createRepoWebhook(token: string, owner: string, repo: string): Promise<CreateWebhookResult>;
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
