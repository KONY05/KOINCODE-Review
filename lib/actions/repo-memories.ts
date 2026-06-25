"use server";

import { eq, and, desc, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { repoMemories, repos } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";

const PAGE_SIZE = 25;
const MAX_MEMORIES_PER_REPO = 50;

export type MemoryRow = {
  id: string;
  repoId: string;
  repoFullName: string;
  rule: string;
  sourceUrl: string;
  isActive: boolean;
  createdAt: string;
};

type MemoriesData = {
  memories: MemoryRow[];
  totalCount: number;
  pageCount: number;
};

export async function getRepoMemories(
  page: number = 0
): Promise<ActionResult<MemoriesData>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(repoMemories)
      .where(eq(repoMemories.userId, user.id));

    const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

    const rows = await db
      .select({
        id: repoMemories.id,
        repoId: repoMemories.repoId,
        repoFullName: repos.fullName,
        rule: repoMemories.rule,
        sourceUrl: repoMemories.sourceUrl,
        isActive: repoMemories.isActive,
        createdAt: repoMemories.createdAt,
      })
      .from(repoMemories)
      .innerJoin(repos, eq(repoMemories.repoId, repos.id))
      .where(eq(repoMemories.userId, user.id))
      .orderBy(desc(repoMemories.createdAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE);

    const memories: MemoryRow[] = rows.map((r) => ({
      id: r.id,
      repoId: r.repoId,
      repoFullName: r.repoFullName,
      rule: r.rule,
      sourceUrl: r.sourceUrl,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    }));

    return ok({ memories, totalCount: total, pageCount });
  } catch (e) {
    return fail("Failed to fetch repository memories", e);
  }
}

export async function toggleMemoryActive(
  memoryId: string
): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const [memory] = await db
      .select()
      .from(repoMemories)
      .where(
        and(eq(repoMemories.id, memoryId), eq(repoMemories.userId, user.id))
      )
      .limit(1);

    if (!memory) return fail("Memory not found");

    const newIsActive = !memory.isActive;

    await db
      .update(repoMemories)
      .set({ isActive: newIsActive })
      .where(eq(repoMemories.id, memoryId));

    await trackServer(EVENTS.MEMORY_RULE_TOGGLED, user.id, {
      repo_id: memory.repoId,
      is_active: newIsActive,
    });

    return ok(null);
  } catch (e) {
    return fail("Failed to toggle memory status", e);
  }
}

export async function deleteMemory(memoryId: string): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    await db
      .delete(repoMemories)
      .where(
        and(eq(repoMemories.id, memoryId), eq(repoMemories.userId, user.id))
      );

    await trackServer(EVENTS.MEMORY_RULE_DELETED, user.id);

    return ok(null);
  } catch (e) {
    return fail("Failed to delete memory", e);
  }
}

export async function addMemory(
  repoId: string,
  rule: string
): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const [repo] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(
        and(
          eq(repos.id, repoId),
          eq(repos.userId, user.id),
          eq(repos.isActive, true)
        )
      )
      .limit(1);

    if (!repo) return fail("Repository not found");

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(repoMemories)
      .where(
        and(eq(repoMemories.repoId, repoId), eq(repoMemories.isActive, true))
      );

    if (count >= MAX_MEMORIES_PER_REPO) {
      return fail(`Maximum of ${MAX_MEMORIES_PER_REPO} active memories per repo`);
    }

    const trimmed = rule.trim().slice(0, 280);
    if (trimmed.length < 3) return fail("Rule is too short");

    await db.insert(repoMemories).values({
      repoId,
      userId: user.id,
      rule: trimmed,
      sourceUrl: "manual",
    });

    await trackServer(EVENTS.MEMORY_RULE_ADDED, user.id, {
      repo_id: repoId,
      source: "manual",
    });

    return ok(null);
  } catch (e) {
    return fail("Failed to add memory", e);
  }
}

type RepoOption = {
  id: string;
  fullName: string;
};

export async function getConnectedRepos(): Promise<
  ActionResult<RepoOption[]>
> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const options = await db
      .select({ id: repos.id, fullName: repos.fullName })
      .from(repos)
      .where(and(eq(repos.userId, user.id), eq(repos.isActive, true)))
      .orderBy(repos.fullName);

    return ok(options);
  } catch (e) {
    return fail("Failed to fetch repositories", e);
  }
}
