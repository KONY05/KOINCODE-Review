import { eq, and, lt, asc, count } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";

import { inngest } from "./client";
import { db } from "@/lib/db";
import {
  repos,
  apiKeys,
  users,
  reviews,
  repoMemories,
  keyUsageLogs,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { fetchRepoTree } from "@/lib/github/tree";
import { indexRepoFiles, indexChangedFiles } from "@/lib/vector/indexing";
import { deleteNamespace } from "@/lib/vector/client";
import { fetchPRFiles, fetchPRDiff } from "@/lib/github/diff";
import { fetchChangedFileContents, fetchFileContent } from "@/lib/github/files";
import { postReviewComments, replyToComment } from "@/lib/github/comments";
import { createCommitStatus } from "@/lib/github/checks";
import { retrieveContext, buildContextQuery } from "@/lib/vector/retrieval";
import { runReview } from "@/lib/ai/review";
import { extractRule } from "@/lib/ai/memory";
import type { ReviewComment } from "@/lib/db/schema/reviews";
import type { LlmProvider } from "@/lib/db/schema/api-keys";
import type { UsageAction, UsageStatus } from "@/lib/db/schema/key-usage-logs";
import { EMBEDDING_MODEL } from "../vector/embeddings";



async function logKeyUsage(values: {
  userId: string;
  apiKeyId?: string | null;
  repoId?: string | null;
  reviewId?: string | null;
  action: UsageAction;
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: UsageStatus;
  error?: string | null;
}) {
  try {
    await db.insert(keyUsageLogs).values(values);
  } catch (err) {
    console.error("Failed to insert key usage log:", err);
  }
}

export const indexRepo = inngest.createFunction(
  {
    id: "index-repo",
    retries: 3,
    triggers: [{ event: "repo/connected" }],
  },
  async ({ event }) => {
    const { repoId, owner, name, defaultBranch, githubToken } = event.data;

    const [repo] = await db
      .select({ userId: repos.userId })
      .from(repos)
      .where(eq(repos.id, repoId))
      .limit(1);

    let googleApiKey: string | undefined;
    let googleKeyId: string | undefined;
    if (repo) {
      const [userKey] = await db
        .select({ id: apiKeys.id, encryptedKey: apiKeys.encryptedKey })
        .from(apiKeys)
        .where(
          and(eq(apiKeys.userId, repo.userId), eq(apiKeys.provider, "google"))
        )
        .limit(1);

      if (userKey) {
        googleApiKey = decrypt(userKey.encryptedKey);
        googleKeyId = userKey.id;
      }
    }

    await db
      .update(repos)
      .set({ indexingStatus: "indexing" })
      .where(eq(repos.id, repoId));

    try {
      const files = await fetchRepoTree(
        githubToken,
        owner,
        name,
        defaultBranch
      );

      const embeddingUsage = await indexRepoFiles(repoId, files, googleApiKey);

      if (repo && embeddingUsage.totalTokens > 0) {
        await logKeyUsage({
          userId: repo.userId,
          apiKeyId: googleKeyId,
          repoId,
          action: "embedding",
          provider: "google",
          model: EMBEDDING_MODEL,
          inputTokens: embeddingUsage.totalTokens,
          outputTokens: 0,
          durationMs: embeddingUsage.totalDurationMs,
          status: "success",
        });
      }

      await db
        .update(repos)
        .set({ indexingStatus: "completed" })
        .where(eq(repos.id, repoId));

      return { indexed: files.length };
    } catch (error) {
      if (repo) {
        await logKeyUsage({
          userId: repo.userId,
          apiKeyId: googleKeyId,
          repoId,
          action: "embedding",
          provider: "google",
          model: EMBEDDING_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      await db
        .update(repos)
        .set({ indexingStatus: "failed" })
        .where(eq(repos.id, repoId));

      throw error;
    }
  }
);

const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export const cleanupDisconnectedRepos = inngest.createFunction(
  {
    id: "cleanup-disconnected-repos",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async () => {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const staleRepos = await db
      .select({ id: repos.id })
      .from(repos)
      .where(
        and(
          eq(repos.isActive, false),
          lt(repos.disconnectedAt, cutoff)
        )
      );

    for (const repo of staleRepos) {
      await deleteNamespace(`repo:${repo.id}`);
      await db.delete(repos).where(eq(repos.id, repo.id));
    }

    return { cleaned: staleRepos.length };
  }
);

export const processReview = inngest.createFunction(
  {
    id: "process-review",
    retries: 3,
    triggers: [{ event: "pr/review-requested" }],
  },
  async ({ event, step }) => {
    const {
      reviewId,
      repoId,
      userId,
      prNumber,
      prTitle,
      headSha,
      headBranch,
      baseBranch,
      repoFullName,
    } = event.data;

    const [owner, repoName] = repoFullName.split("/");

    const userConfig = await step.run("load-user", async () => {
      const [user] = await db
        .select({ clerkId: users.clerkId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) throw new Error("User not found");

      return { clerkId: user.clerkId };
    });

    const githubToken = await step.run("get-github-token", async () => {
      const client = await clerkClient();

      const response = await client.users.getUserOauthAccessToken(
        userConfig.clerkId,
        "github"
      );

      const token = response.data[0]?.token;

      if (!token) throw new Error("Could not retrieve GitHub token");

      return token;
    });

    await step.run("set-commit-status-pending", async () => {
      await createCommitStatus(githubToken, owner, repoName, headSha, {
        state: "pending",
        description: "Review in progress...",
      });
    });

    const config = await step.run("load-config", async () => {
      const [key] = await db
        .select({
          id: apiKeys.id,
          encryptedKey: apiKeys.encryptedKey,
          provider: apiKeys.provider,
          model: apiKeys.model,
        })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isDefault, true)))
        .limit(1);

      if (!key) return null;

      let googleEncryptedKey: string | undefined;
      if (key.provider === "google") {
        googleEncryptedKey = key.encryptedKey;
      } else {
        const [googleKey] = await db
          .select({ encryptedKey: apiKeys.encryptedKey })
          .from(apiKeys)
          .where(
            and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "google"))
          )
          .limit(1);

        if (googleKey) googleEncryptedKey = googleKey.encryptedKey;
      }

      return {
        apiKeyId: key.id,
        provider: key.provider as LlmProvider,
        model: key.model,
        encryptedKey: key.encryptedKey,
        googleEncryptedKey,
      };
    });

    if (!config) {
      await step.run("handle-no-api-key", async () => {
        await db
          .update(reviews)
          .set({
            status: "failed",
            summary: "No API key configured. Add one in Settings.",
          })
          .where(eq(reviews.id, reviewId));

        await createCommitStatus(githubToken, owner, repoName, headSha, {
          state: "failure",
          description: "No API key configured. Add one in Settings.",
        });
      });

      return { status: "failed", reason: "no-api-key" };
    }

    try {
      await step.run("set-in-progress", async () => {
        await db
          .update(reviews)
          .set({ status: "in_progress" })
          .where(eq(reviews.id, reviewId));
      });

      const reviewData = await step.run("run-review", async () => {
        const [prFiles, diff] = await Promise.all([
          fetchPRFiles(githubToken, owner, repoName, prNumber),
          fetchPRDiff(githubToken, owner, repoName, prNumber),
        ]);

        const reviewableFiles = prFiles
          .filter((f) => f.status === "added" || f.status === "modified")
          .map((f) => f.filename);

        const fileContents = await fetchChangedFileContents(
          githubToken,
          owner,
          repoName,
          reviewableFiles,
          headSha
        );

        const memories = await db
          .select({ rule: repoMemories.rule })
          .from(repoMemories)
          .where(
            and(
              eq(repoMemories.repoId, repoId),
              eq(repoMemories.isActive, true)
            )
          );

        let codebaseContext: { filePath: string; text: string }[] = [];
        const googleApiKey = config.googleEncryptedKey
          ? decrypt(config.googleEncryptedKey)
          : undefined;
        try {
          const query = buildContextQuery(
            prTitle,
            prFiles.map((f) => f.filename)
          );
          const retrieval = await retrieveContext(
            repoId,
            query,
            googleApiKey
          );
          codebaseContext = retrieval.contexts;

          if (retrieval.usage.tokens > 0) {
            await logKeyUsage({
              userId,
              apiKeyId: config.apiKeyId,
              repoId,
              reviewId,
              action: "embedding",
              provider: "google",
              model: EMBEDDING_MODEL,
              inputTokens: retrieval.usage.tokens,
              outputTokens: 0,
              durationMs: retrieval.durationMs,
              status: "success",
            });
          }
        } catch {
          // non-fatal
        }

        const apiKey = decrypt(config.encryptedKey);

        try {
          const result = await runReview({
            provider: config.provider,
            model: config.model,
            apiKey,
            prTitle,
            headBranch,
            baseBranch,
            filesChanged: prFiles.length,
            codebaseContext,
            fileContents: new Map(fileContents),
            diff,
            repoMemories: memories.map((m) => m.rule),
          });

          await logKeyUsage({
            userId,
            apiKeyId: config.apiKeyId,
            repoId,
            reviewId,
            action: "review",
            provider: config.provider,
            model: config.model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            durationMs: result.durationMs,
            status: "success",
          });

          const patches = Object.fromEntries(
            prFiles
              .filter((f) => f.patch)
              .map((f) => [f.filename, f.patch!])
          );

          return {
            response: result.response,
            patches,
            reviewedFiles: reviewableFiles,
          };
        } catch (error) {
          await logKeyUsage({
            userId,
            apiKeyId: config.apiKeyId,
            repoId,
            reviewId,
            action: "review",
            provider: config.provider,
            model: config.model,
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 0,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }
      });

      const postedComments = await step.run("post-comments", async () => {
        const patches = new Map(Object.entries(reviewData.patches));

        try {
          return await postReviewComments(
            githubToken,
            owner,
            repoName,
            prNumber,
            headSha,
            reviewData.response.comments,
            patches,
            {
              summary: reviewData.response.summary,
              walkthrough: reviewData.response.walkthrough,
              diagram: reviewData.response.diagram,
            }
          );
        } catch (error) {
          console.error("Failed to post review comments to GitHub:", error);
          return [];
        }
      });

      await step.run("save-review", async () => {
        const comments: ReviewComment[] =
          reviewData.response.comments.map((c, index) => {
            const posted = postedComments[index];
            return {
              path: c.path,
              startLine: c.startLine,
              line: c.line,
              body: c.body,
              suggestion: c.suggestion,
              status: "pending" as const,
              githubCommentId: posted?.githubCommentId,
            };
          });

        await db
          .update(reviews)
          .set({
            status: "completed",
            summary: reviewData.response.summary,
            comments,
            model: config.model,
            completedAt: new Date(),
          })
          .where(eq(reviews.id, reviewId));
      });

      const commentCount = reviewData.response.comments.length;
      await step.run("set-commit-status-success", async () => {
        const description =
          commentCount > 0
            ? `Found ${commentCount} issue${commentCount === 1 ? "" : "s"}`
            : "No issues found";

        await createCommitStatus(githubToken, owner, repoName, headSha, {
          state: "success",
          description,
        });
      });

      await step.sendEvent("dispatch-index-changed-files", {
        name: "repo/index-changed-files",
        data: {
          repoId,
          userId,
          reviewId,
          repoFullName,
          headSha,
          filePaths: reviewData.reviewedFiles,
          apiKeyId: config.apiKeyId,
        },
      });

      return {
        status: "completed",
        reviewId,
        commentsPosted: postedComments.length,
      };
    } catch (error) {
      await step.run("set-commit-status-failure", async () => {
        const reason =
          error instanceof Error ? error.message : "Unknown error";

        await createCommitStatus(githubToken, owner, repoName, headSha, {
          state: "error",
          description: `Review failed: ${reason}`,
        });

        await db
          .update(reviews)
          .set({
            status: "failed",
            summary: reason,
          })
          .where(eq(reviews.id, reviewId));
      });

      throw error;
    }
  }
);

export const indexChangedFilesJob = inngest.createFunction(
  {
    id: "index-changed-files",
    retries: 2,
    triggers: [{ event: "repo/index-changed-files" }],
  },
  async ({ event }) => {
    const {
      repoId,
      userId,
      reviewId,
      repoFullName,
      headSha,
      filePaths,
      apiKeyId,
    } = event.data;

    const [owner, repoName] = repoFullName.split("/");

    const [user] = await db
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return { status: "skipped", reason: "user-not-found" };

    const client = await clerkClient();
    const response = await client.users.getUserOauthAccessToken(
      user.clerkId,
      "github"
    );
    const githubToken = response.data[0]?.token;
    if (!githubToken) return { status: "skipped", reason: "no-token" };

    let googleApiKey: string | undefined;
    const [googleKey] = await db
      .select({ encryptedKey: apiKeys.encryptedKey })
      .from(apiKeys)
      .where(
        and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "google"))
      )
      .limit(1);

    if (googleKey) googleApiKey = decrypt(googleKey.encryptedKey);

    let totalTokens = 0;
    let totalDurationMs = 0;
    let filesIndexed = 0;

    for (const filePath of filePaths) {
      const content = await fetchFileContent(
        githubToken,
        owner,
        repoName,
        filePath,
        headSha
      );

      if (!content) continue;

      const file = { path: filePath, content, fileType: "source" as const };
      const usage = await indexChangedFiles(repoId, [file], googleApiKey);

      totalTokens += usage.totalTokens;
      totalDurationMs += usage.totalDurationMs;
      filesIndexed++;
    }

    if (totalTokens > 0) {
      await logKeyUsage({
        userId,
        apiKeyId,
        repoId,
        reviewId,
        action: "embedding",
        provider: "google",
        model: EMBEDDING_MODEL,
        inputTokens: totalTokens,
        outputTokens: 0,
        durationMs: totalDurationMs,
        status: "success",
      });
    }

    return { status: "indexed", files: filesIndexed };
  }
);

const MAX_MEMORIES_PER_REPO = 50;

export const processCommentReply = inngest.createFunction(
  {
    id: "process-comment-reply",
    retries: 3,
    triggers: [{ event: "comment/reply-received" }],
  },
  async ({ event, step }) => {
    const {
      repoId,
      userId,
      prNumber,
      repoFullName,
      originalComment,
      userReply,
      replyCommentId,
      sourceUrl,
    } = event.data;

    const [owner, repoName] = repoFullName.split("/");

    const config = await step.run("load-config", async () => {
      const [user] = await db
        .select({ clerkId: users.clerkId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return null;

      const [key] = await db
        .select({
          id: apiKeys.id,
          encryptedKey: apiKeys.encryptedKey,
          provider: apiKeys.provider,
          model: apiKeys.model,
        })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isDefault, true)))
        .limit(1);

      if (!key) return null;

      return {
        clerkId: user.clerkId,
        apiKeyId: key.id,
        provider: key.provider as LlmProvider,
        model: key.model,
        encryptedKey: key.encryptedKey,
      };
    });

    if (!config) return { status: "skipped", reason: "no-config" };

    const rule = await step.run("extract-rule", async () => {
      const apiKey = decrypt(config.encryptedKey);

      try {
        const result = await extractRule({
          provider: config.provider,
          model: config.model,
          apiKey,
          originalComment,
          userReply,
        });

        await logKeyUsage({
          userId,
          apiKeyId: config.apiKeyId,
          repoId,
          action: "memory_extraction",
          provider: config.provider,
          model: config.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          durationMs: result.durationMs,
          status: "success",
        });

        return result.rule;
      } catch (error) {
        await logKeyUsage({
          userId,
          apiKeyId: config.apiKeyId,
          repoId,
          action: "memory_extraction",
          provider: config.provider,
          model: config.model,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    });

    if (!rule) return { status: "skipped", reason: "not-a-rule" };

    const isDuplicate = await step.run("check-duplicate", async () => {
      const existing = await db
        .select({ rule: repoMemories.rule })
        .from(repoMemories)
        .where(
          and(
            eq(repoMemories.repoId, repoId),
            eq(repoMemories.isActive, true)
          )
        );

      const normalized = rule.toLowerCase().trim();
      return existing.some((m) => {
        const existingNormalized = m.rule.toLowerCase().trim();
        return (
          existingNormalized === normalized ||
          existingNormalized.includes(normalized) ||
          normalized.includes(existingNormalized)
        );
      });
    });

    if (isDuplicate) return { status: "skipped", reason: "duplicate" };

    await step.run("store-memory", async () => {
      const [{ total }] = await db
        .select({ total: count() })
        .from(repoMemories)
        .where(
          and(
            eq(repoMemories.repoId, repoId),
            eq(repoMemories.isActive, true)
          )
        );

      if (total >= MAX_MEMORIES_PER_REPO) {
        const [oldest] = await db
          .select({ id: repoMemories.id })
          .from(repoMemories)
          .where(
            and(
              eq(repoMemories.repoId, repoId),
              eq(repoMemories.isActive, true)
            )
          )
          .orderBy(asc(repoMemories.createdAt))
          .limit(1);

        if (oldest) {
          await db
            .update(repoMemories)
            .set({ isActive: false })
            .where(eq(repoMemories.id, oldest.id));
        }
      }

      await db.insert(repoMemories).values({
        repoId,
        userId,
        rule,
        sourceUrl,
      });
    });

    await step.run("confirm-on-github", async () => {
      try {
        const client = await clerkClient();
        const response = await client.users.getUserOauthAccessToken(
          config.clerkId,
          "github"
        );
        const token = response.data[0]?.token;
        if (!token) return;

        await replyToComment(
          token,
          owner,
          repoName,
          prNumber,
          replyCommentId,
          `Got it — I'll remember: *${rule}*`
        );
      } catch (error) {
        console.error("Failed to post confirmation reply:", error);
      }
    });

    return { status: "stored", rule };
  }
);
