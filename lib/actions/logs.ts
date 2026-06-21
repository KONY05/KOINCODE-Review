"use server";

import { and, eq, gte, desc, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { keyUsageLogs, repos } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
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

export async function fetchLogs(filter: LogsFilter = {}, page: number = 0) {
  const user = await getAuthUser();
  if (!user) return { logs: [], totalCount: 0, pageCount: 0 };

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
    })
    .from(keyUsageLogs)
    .leftJoin(repos, eq(keyUsageLogs.repoId, repos.id))
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
  }));

  return { logs, totalCount: total, pageCount };
}

export async function fetchLogsSummary(filter: LogsFilter = {}) {
  const user = await getAuthUser();
  if (!user)
    return { totalCalls: 0, totalTokens: 0, successRate: 0, avgDurationMs: 0 };

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

  return {
    totalCalls: result.totalCalls,
    totalTokens: result.totalTokens,
    successRate:
      result.totalCalls > 0
        ? Math.round((result.successCount / result.totalCalls) * 100)
        : 0,
    avgDurationMs: result.avgDurationMs,
  };
}

export async function fetchUserRepoOptions() {
  const user = await getAuthUser();
  if (!user) return [];

  return await db
    .select({ id: repos.id, fullName: repos.fullName })
    .from(repos)
    .where(and(eq(repos.userId, user.id), eq(repos.isActive, true)))
    .orderBy(repos.fullName);
}
