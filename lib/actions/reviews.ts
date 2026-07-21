"use server";

import { and, eq, desc, lt, gte, count } from "drizzle-orm";

import { db } from "@/lib/db";
import { reviews, repos } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { ReviewStatus, ReviewComment } from "@/lib/db/schema/reviews";
import type { GitProviderId } from "@/lib/providers/types";

export type ReviewEntry = {
  id: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  status: ReviewStatus;
  summary: string | null;
  comments: ReviewComment[] | null;
  model: string | null;
  repoFullName: string;
  provider: GitProviderId;
  createdAt: string;
  completedAt: string | null;
};

export type ReviewsSummary = {
  total: number;
  completed: number;
  pending: number;
  failed: number;
};

type FetchReviewsData = {
  reviews: ReviewEntry[];
  hasNextPage: boolean;
};

const PAGE_SIZE = 20;

export async function fetchReviews(
  cursor?: string
): Promise<ActionResult<FetchReviewsData>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const conditions = [eq(reviews.userId, user.id)];

    if (cursor) {
      conditions.push(lt(reviews.createdAt, new Date(cursor)));
    }

    const rows = await db
      .select({
        id: reviews.id,
        prNumber: reviews.prNumber,
        prTitle: reviews.prTitle,
        prUrl: reviews.prUrl,
        status: reviews.status,
        summary: reviews.summary,
        comments: reviews.comments,
        model: reviews.model,
        createdAt: reviews.createdAt,
        completedAt: reviews.completedAt,
        repoFullName: repos.fullName,
        provider: repos.provider,
      })
      .from(reviews)
      .innerJoin(repos, eq(reviews.repoId, repos.id))
      .where(and(...conditions))
      .orderBy(desc(reviews.createdAt))
      .limit(PAGE_SIZE + 1);

    const hasNextPage = rows.length > PAGE_SIZE;
    const page = hasNextPage ? rows.slice(0, PAGE_SIZE) : rows;

    return ok({
      reviews: page.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      hasNextPage,
    });
  } catch (e) {
    return fail("Failed to fetch reviews", e);
  }
}

export async function fetchReviewsSummary(): Promise<
  ActionResult<ReviewsSummary>
> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const rows = await db
      .select({
        status: reviews.status,
        count: count(),
      })
      .from(reviews)
      .where(eq(reviews.userId, user.id))
      .groupBy(reviews.status);

    const summary: ReviewsSummary = {
      total: 0,
      completed: 0,
      pending: 0,
      failed: 0,
    };

    for (const row of rows) {
      summary.total += row.count;
      if (row.status === "completed") summary.completed = row.count;
      if (row.status === "pending" || row.status === "in_progress")
        summary.pending += row.count;
      if (row.status === "failed") summary.failed = row.count;
    }

    return ok(summary);
  } catch (e) {
    return fail(
      "Failed to fetch reviews summary", e
    );
  }
}

export type MonthlyReviewCount = {
  month: string;
  reviews: number;
  issuesFound: number;
};

/**
 * Grouped in JS rather than SQL (unlike the original GitHub-contribution-era
 * version of this query) — issuesFound needs each completed review's
 * `comments` array length, which isn't a plain SQL count(), and this way
 * both metrics come from a single row fetch instead of two different
 * aggregation strategies. Same pattern already used by
 * lib/inngest/functions.ts's trackAdoptionSummary for the same reason.
 */
export async function fetchMonthlyReviewCounts(): Promise<
  ActionResult<MonthlyReviewCount[]>
> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const rows = await db
      .select({ createdAt: reviews.createdAt, comments: reviews.comments })
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, user.id),
          eq(reviews.status, "completed"),
          gte(reviews.createdAt, sixMonthsAgo)
        )
      );

    const byMonth = new Map<string, { reviews: number; issuesFound: number }>();
    for (const row of rows) {
      const month = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const entry = byMonth.get(month) ?? { reviews: 0, issuesFound: 0 };
      entry.reviews += 1;
      entry.issuesFound += row.comments?.length ?? 0;
      byMonth.set(month, entry);
    }

    const result: MonthlyReviewCount[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = byMonth.get(month) ?? { reviews: 0, issuesFound: 0 };
      result.push({ month, ...entry });
    }

    return ok(result);
  } catch (e) {
    return fail("Failed to fetch monthly review counts", e);
  }
}

export type DailyReviewCount = { date: string; count: number };

/**
 * Powers the dashboard's activity calendar. Replaces the previous
 * GitHub-only contribution calendar (lib/providers/github/contributions.ts)
 * — GitLab has no reliably documented equivalent and Azure DevOps has none
 * at all, but every review, regardless of provider, creates a row here, so
 * this works identically no matter which git host a user's repos live on.
 */
export async function fetchDailyReviewCounts(): Promise<
  ActionResult<DailyReviewCount[]>
> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setHours(0, 0, 0, 0);

    const rows = await db
      .select({ createdAt: reviews.createdAt })
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, user.id),
          eq(reviews.status, "completed"),
          gte(reviews.createdAt, oneYearAgo)
        )
      );

    const countsByDate = new Map<string, number>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1);
    }

    const result: DailyReviewCount[] = [];
    const now = new Date();
    for (
      const d = new Date(oneYearAgo);
      d <= now;
      d.setDate(d.getDate() + 1)
    ) {
      const date = d.toISOString().slice(0, 10);
      result.push({ date, count: countsByDate.get(date) ?? 0 });
    }

    return ok(result);
  } catch (e) {
    return fail("Failed to fetch daily review counts", e);
  }
}

export type DashboardStats = {
  connectedRepos: number;
  completedReviews: number;
  issuesFound: number;
  adoptionRate: number | null;
};

/**
 * Replaces Stats.tsx's previous GitHub-only contribution numbers (total
 * repos contributed to, commits, PRs) with numbers we own regardless of
 * provider — connected-repo count and review-derived metrics.
 */
export async function fetchDashboardStats(): Promise<
  ActionResult<DashboardStats>
> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const [[repoCountRow], completedReviewRows] = await Promise.all([
      db
        .select({ connectedRepos: count() })
        .from(repos)
        .where(and(eq(repos.userId, user.id), eq(repos.isActive, true))),
      db
        .select({ comments: reviews.comments })
        .from(reviews)
        .where(
          and(
            eq(reviews.userId, user.id),
            eq(reviews.status, "completed"),
            gte(reviews.createdAt, oneYearAgo)
          )
        ),
    ]);

    let issuesFound = 0;
    let adopted = 0;
    let pending = 0;
    for (const row of completedReviewRows) {
      const comments = row.comments ?? [];
      issuesFound += comments.length;
      for (const c of comments) {
        if (c.status === "adopted") adopted++;
        else pending++;
      }
    }

    const totalTracked = adopted + pending;

    return ok({
      connectedRepos: repoCountRow.connectedRepos,
      completedReviews: completedReviewRows.length,
      issuesFound,
      adoptionRate: totalTracked > 0 ? adopted / totalTracked : null,
    });
  } catch (e) {
    return fail("Failed to fetch dashboard stats", e);
  }
}
