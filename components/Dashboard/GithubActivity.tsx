"use client";

import { useTheme } from "next-themes";
import { ActivityCalendar } from "react-activity-calendar";
import "react-activity-calendar/tooltips.css";
import type { Activity } from "react-activity-calendar";
import { Skeleton } from "../ui/skeleton";
import type { ContributionCalendar } from "@/lib/github/contributions";

const LEVEL_MAP: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

function toActivityData(calendar: ContributionCalendar) {
  return calendar.weeks.flatMap((week) =>
    week.contributionDays.map((day) => ({
      date: day.date,
      count: day.contributionCount,
      level: LEVEL_MAP[day.contributionLevel] ?? 0,
    }))
  );
}

export default function GithubActivity({
  calendar,
}: {
  calendar: ContributionCalendar | null;
}) {
  const { resolvedTheme } = useTheme();

  if (!calendar) {
    return (
      <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
        <h3 className="text-[17px] font-semibold">Contribution Activity</h3>
        <p className="mt-1 text-[13.5px] text-(--kc-text-secondary)">
          Visualizing your coding frequency over the last year
        </p>
        <div className="mt-6 flex flex-col items-center gap-4">
          <Skeleton className="h-[120px] w-full max-w-[700px] rounded-xl" />
          <p className="text-[13px] text-(--kc-text-dim)">
            Connect your GitHub account to start tracking activity
          </p>
        </div>
      </div>
    );
  }

  const data = toActivityData(calendar);
  const colorScheme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
      <h3 className="text-[17px] font-semibold">Contribution Activity</h3>
      <p className="mt-1 text-[13.5px] text-(--kc-text-secondary)">
        {calendar.totalContributions.toLocaleString()} contributions in the last
        year
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
                return `${activity.count} contribution${activity.count !== 1 ? "s" : ""} on ${formatted}`;
              },
            },
          }}
        />
      </div>
    </div>
  );
}
