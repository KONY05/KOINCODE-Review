import type { GitProvider } from "../types";
import { getGithubToken, getTokenForClerkUser } from "./auth";
import { listUserRepos, fetchRepoByFullName } from "./repos";
import { createRepoWebhook, deleteRepoWebhook } from "./webhooks";
import { fetchRepoTree } from "./tree";
import { fetchFileContent, fetchChangedFileContents } from "./files";
import { fetchPRFiles, fetchPRDiff, fetchPRHeadSha } from "./diff";
import { postReviewComments, replyToComment } from "./comments";
import { createCommitStatus } from "./checks";
import { fetchPushChanges } from "./adoption";

export const githubProvider: GitProvider = {
  id: "github",
  getTokenForClerkUser,
  listUserRepos,
  fetchRepoByFullName,
  createRepoWebhook,
  deleteRepoWebhook,
  fetchRepoTree,
  fetchFileContent,
  fetchChangedFileContents,
  fetchPRFiles,
  fetchPRDiff,
  fetchPRHeadSha,
  postReviewComments,
  replyToComment,
  createCommitStatus,
  fetchPushChanges,
};

// Session-scoped convenience (no clerkId arg) and the contribution-graph
// bonus feature aren't part of GitProvider — they're GitHub-only surfaces
// used directly by call sites that are inherently GitHub-specific today
// (the dashboard's activity widget, the dashboard's own repo-connect flow).
export { getGithubToken };
export * from "./contributions";
