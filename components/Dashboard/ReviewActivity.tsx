"use client";

import { useTheme } from "next-themes";
import { ActivityCalendar } from "react-activity-calendar";
import "react-activity-calendar/tooltips.css";
import type { Activity } from "react-activity-calendar";
import { Skeleton } from "../ui/skeleton";
import type { DailyReviewCount } from "@/lib/actions/reviews";

/**
 * Quartile-bucketed the same way GitHub's contributionLevel was, but
 * computed here instead of received from a provider API — this calendar is
 * sourced from our own reviews table (see fetchDailyReviewCounts), which
 * has no notion of "level" built in.
 */
function toActivityData(daily: DailyReviewCount[]) {
  const max = Math.max(...daily.map((d) => d.count), 0);

  return daily.map((d) => {
    let level = 0;
    if (max > 0 && d.count > 0) {
      const ratio = d.count / max;
      if (ratio > 0.75) level = 4;
      else if (ratio > 0.5) level = 3;
      else if (ratio > 0.25) level = 2;
      else level = 1;
    }
    return { date: d.date, count: d.count, level };
  });
}

export default function ReviewActivity({
  dailyReviews,
}: {
  dailyReviews: DailyReviewCount[] | null;
}) {
  const { resolvedTheme } = useTheme();

  if (!dailyReviews || resolvedTheme === undefined) {
    return (
      <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
        <h3 className="text-[17px] font-semibold">Review Activity</h3>
        <p className="mt-1 text-[13.5px] text-(--kc-text-secondary)">
          AI reviews completed over the last year
        </p>
        <div className="mt-6 flex flex-col items-center gap-4">
          <Skeleton className="h-[120px] w-full max-w-[700px] rounded-xl" />
        </div>
      </div>
    );
  }

  const data = toActivityData(dailyReviews);
  const totalReviews = dailyReviews.reduce((sum, d) => sum + d.count, 0);
  const colorScheme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
      <h3 className="text-[17px] font-semibold">Review Activity</h3>
      <p className="mt-1 text-[13.5px] text-(--kc-text-secondary)">
        {totalReviews.toLocaleString()} reviews completed in the last year
      </p>

      <div className="mt-6 flex justify-center overflow-x-auto">
        <ActivityCalendar
          data={data}
          colorScheme={colorScheme}
          blockSize={11}
          blockMargin={3}
          blockRadius={2}
          fontSize={11}
          showWeekdayLabels={["mon", "wed", "fri"]}
          theme={{
            light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
            dark: ["#2d333b", "#0e4429", "#006d32", "#26a641", "#39d353"],
          }}
          tooltips={{
            activity: {
              text: (activity: Activity) => {
                const d = new Date(activity.date + "T00:00:00");
                const formatted = d.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                });
                return `${activity.count} review${activity.count !== 1 ? "s" : ""} on ${formatted}`;
              },
            },
          }}
        />
      </div>
    </div>
  );
}
