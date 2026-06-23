"use server";

import { and, eq, gte, desc, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { keyUsageLogs, repos, reviews } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { UsageAction, UsageStatus } from "@/lib/db/schema/key-usage-logs";

export type LogEntry = {
  id: string;
  action: UsageAction;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: UsageStatus;
  error: string | null;
  createdAt: string;
  repoFullName: string | null;
  prNumber: number | null;
};

export type LogsSummary = {
  totalCalls: number;
  totalTokens: number;
  successRate: number;
  avgDurationMs: number;
};

export type LogsFilter = {
  action?: UsageAction;
  status?: UsageStatus;
  repoId?: string;
  days?: number;
};

type LogsData = {
  logs: LogEntry[];
  totalCount: number;
  pageCount: number;
};

const PAGE_SIZE = 25;

function buildConditions(userId: string, filter: LogsFilter) {
  const conditions = [eq(keyUsageLogs.userId, userId)];

  if (filter.action) {
    conditions.push(eq(keyUsageLogs.action, filter.action));
  }
  if (filter.status) {
    conditions.push(eq(keyUsageLogs.status, filter.status));
  }
  if (filter.repoId) {
    conditions.push(eq(keyUsageLogs.repoId, filter.repoId));
  }
  if (filter.days) {
    const since = new Date(Date.now() - filter.days * 24 * 60 * 60 * 1000);
    conditions.push(gte(keyUsageLogs.createdAt, since));
  }

  return conditions;
}

export async function fetchLogs(
  filter: LogsFilter = {},
  page: number = 0
): Promise<ActionResult<LogsData>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const conditions = buildConditions(user.id, filter);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(keyUsageLogs)
      .where(and(...conditions));

    const pageCount = Math.ceil(total / PAGE_SIZE);

    const rows = await db
      .select({
        id: keyUsageLogs.id,
        action: keyUsageLogs.action,
        provider: keyUsageLogs.provider,
        model: keyUsageLogs.model,
        inputTokens: keyUsageLogs.inputTokens,
        outputTokens: keyUsageLogs.outputTokens,
        durationMs: keyUsageLogs.durationMs,
        status: keyUsageLogs.status,
        error: keyUsageLogs.error,
        createdAt: keyUsageLogs.createdAt,
        repoFullName: repos.fullName,
        prNumber: reviews.prNumber,
      })
      .from(keyUsageLogs)
      .leftJoin(repos, eq(keyUsageLogs.repoId, repos.id))
      .leftJoin(reviews, eq(keyUsageLogs.reviewId, reviews.id))
      .where(and(...conditions))
      .orderBy(desc(keyUsageLogs.createdAt), desc(keyUsageLogs.id))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE);

    const logs: LogEntry[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      provider: r.provider,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      durationMs: r.durationMs,
      status: r.status,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      repoFullName: r.repoFullName,
      prNumber: r.prNumber,
    }));

    return ok({ logs, totalCount: total, pageCount });
  } catch (e) {
    return fail("Failed to fetch logs", e);
  }
}

export async function fetchLogsSummary(
  filter: LogsFilter = {}
): Promise<ActionResult<LogsSummary>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const conditions = buildConditions(user.id, filter);

    const [result] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${keyUsageLogs.inputTokens} + ${keyUsageLogs.outputTokens}), 0)::int`,
        successCount: sql<number>`count(*) filter (where ${keyUsageLogs.status} = 'success')::int`,
        avgDurationMs: sql<number>`coalesce(avg(${keyUsageLogs.durationMs}), 0)::int`,
      })
      .from(keyUsageLogs)
      .where(and(...conditions));

    return ok({
      totalCalls: result.totalCalls,
      totalTokens: result.totalTokens,
      successRate:
        result.totalCalls > 0
          ? Math.round((result.successCount / result.totalCalls) * 100)
          : 0,
      avgDurationMs: result.avgDurationMs,
    });
  } catch (e) {
    return fail("Failed to fetch logs summary", e);
  }
}

type RepoOption = {
  id: string;
  fullName: string;
};

export async function fetchUserRepoOptions(): Promise<
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
    return fail("Failed to fetch repo options", e);
  }
}
