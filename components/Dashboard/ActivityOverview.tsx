"use client";

import { useState } from "react";
import { Skeleton } from "../ui/skeleton";

import { MONTH_LABELS } from "@/lib/constants";
import type { MonthlyActivity } from "@/lib/github/contributions";
import type { MonthlyReviewCount } from "@/lib/actions/reviews";

function formatMonth(yearMonth: string) {
  const month = parseInt(yearMonth.split("-")[1], 10);
  return MONTH_LABELS[month - 1];
}

type TooltipState = {
  month: string;
  commits: number;
  pullRequests: number;
  reviews: number;
  x: number;
  y: number;
} | null;

export default function ActivityOverview({
  monthlyActivity,
  monthlyReviews,
}: {
  monthlyActivity: MonthlyActivity[] | null;
  monthlyReviews: MonthlyReviewCount[];
}) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  if (!monthlyActivity || monthlyActivity.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
        <h3 className="text-[17px] font-semibold">Activity Overview</h3>
        <p className="mt-1 text-[13.5px] text-(--kc-text-secondary)">
          Monthly breakdown of commits, PRs, and reviews
        </p>
        <div className="mt-6 flex items-end justify-center gap-7">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-20 w-[18px] rounded" />
              <Skeleton className="h-3 w-8 rounded" />
            </div>
          ))}
        </div>
        <Legend />
      </div>
    );
  }

  const reviewsMap = new Map(
    monthlyReviews.map((r) => [r.month, r.reviews])
  );

  const chartData = monthlyActivity.map((m) => ({
    ...m,
    reviews: reviewsMap.get(m.month) ?? 0,
  }));

  const maxValue = Math.max(
    ...chartData.flatMap((m) => [m.commits, m.pullRequests, m.reviews]),
    1
  );
  const maxBarHeight = 120;

  function handleMouseEnter(
    e: React.MouseEvent,
    m: (typeof chartData)[number]
  ) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const parent = (e.currentTarget as HTMLElement)
      .closest("[data-chart-container]")!
      .getBoundingClientRect();

    setTooltip({
      month: formatMonth(m.month),
      commits: m.commits,
      pullRequests: m.pullRequests,
      reviews: m.reviews,
      x: rect.left - parent.left + rect.width / 2,
      y: rect.top - parent.top - 8,
    });
  }

  return (
    <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
      <h3 className="text-[17px] font-semibold">Activity Overview</h3>
      <p className="mt-1 text-[13.5px] text-(--kc-text-secondary)">
        Monthly breakdown of commits, PRs, and reviews
      </p>

      <div className="relative mt-6 flex items-end justify-around" data-chart-container>
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-(--kc-border-subtle) bg-popover px-3 py-2 shadow-lg"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <p className="text-[12px] font-semibold">{tooltip.month}</p>
            <p className="text-[11px] text-(--kc-text-muted)">
              <span className="inline-block size-[8px] rounded-sm bg-[#4493f8] mr-1" />
              {tooltip.commits} commits
            </p>
            <p className="text-[11px] text-(--kc-text-muted)">
              <span className="inline-block size-[8px] rounded-sm bg-[#a371f7] mr-1" />
              {tooltip.pullRequests} PRs
            </p>
            <p className="text-[11px] text-(--kc-text-muted)">
              <span className="inline-block size-[8px] rounded-sm bg-kc-green mr-1" />
              {tooltip.reviews} reviews
            </p>
          </div>
        )}

        {chartData.map((m) => {
          const commitH = Math.max((m.commits / maxValue) * maxBarHeight, 4);
          const prH = Math.max((m.pullRequests / maxValue) * maxBarHeight, 4);
          const reviewH = Math.max((m.reviews / maxValue) * maxBarHeight, 4);

          return (
            <div
              key={m.month}
              className="flex min-w-0 flex-1 cursor-default flex-col items-center gap-2"
              onMouseEnter={(e) => handleMouseEnter(e, m)}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className="flex items-end gap-1">
                <div
                  className="w-[16px] rounded-sm bg-[#4493f8] transition-opacity hover:opacity-80 sm:w-[22px]"
                  style={{ height: `${commitH}px` }}
                />
                <div
                  className="w-[16px] rounded-sm bg-[#a371f7] transition-opacity hover:opacity-80 sm:w-[22px]"
                  style={{ height: `${prH}px` }}
                />
                <div
                  className="w-[16px] rounded-sm bg-kc-green transition-opacity hover:opacity-80 sm:w-[22px]"
                  style={{ height: `${reviewH}px` }}
                />
              </div>
              <span className="text-[12px] text-(--kc-text-muted)">
                {formatMonth(m.month)}
              </span>
            </div>
          );
        })}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-5 flex items-center justify-center gap-5 text-[12.5px] text-(--kc-text-muted)">
      <span className="flex items-center gap-2">
        <span className="size-[11px] rounded-sm bg-[#4493f8]" />
        Commits
      </span>
      <span className="flex items-center gap-2">
        <span className="size-[11px] rounded-sm bg-[#a371f7]" />
        Pull Requests
      </span>
      <span className="flex items-center gap-2">
        <span className="size-[11px] rounded-sm bg-kc-green" />
        AI Reviews
      </span>
    </div>
  );
}
