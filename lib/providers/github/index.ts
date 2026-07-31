import type { GitProvider } from "../types";
import { getTokenForClerkUser } from "./auth";
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
  supportsNativeSuggestions: true,
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
