"use server";

import { and, eq, desc, lt, count } from "drizzle-orm";

import { db } from "@/lib/db";
import { reviews, repos } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { ReviewStatus, ReviewComment } from "@/lib/db/schema/reviews";

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
