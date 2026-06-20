import { eq, and, lt } from "drizzle-orm";

import { inngest } from "./client";
import { db } from "@/lib/db";
import { repos, apiKeys } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { fetchRepoTree } from "@/lib/github/tree";
import { indexRepoFiles } from "@/lib/vector/indexing";
import { deleteNamespace } from "@/lib/vector/client";

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
    if (repo) {
      const [userKey] = await db
        .select({ encryptedKey: apiKeys.encryptedKey })
        .from(apiKeys)
        .where(
          and(eq(apiKeys.userId, repo.userId), eq(apiKeys.provider, "google"))
        )
        .limit(1);

      if (userKey) {
        googleApiKey = decrypt(userKey.encryptedKey);
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

      await indexRepoFiles(repoId, files, googleApiKey);

      await db
        .update(repos)
        .set({ indexingStatus: "completed" })
        .where(eq(repos.id, repoId));

      return { indexed: files.length };
    } catch (error) {
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
