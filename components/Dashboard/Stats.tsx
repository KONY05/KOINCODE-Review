import {
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
} from "lucide-react";

import { MONTH_LABELS } from "@/lib/constants";
import type { ContributionStats } from "@/lib/github/contributions";

function getYearRange() {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  return `(${MONTH_LABELS[yearAgo.getMonth()]} ${yearAgo.getFullYear()} – ${MONTH_LABELS[now.getMonth()]} ${now.getFullYear()})`;
}

export default function Stats({
  contributionStats,
  totalReviews,
}: {
  contributionStats: ContributionStats | null;
  totalReviews: number;
}) {
  const range = getYearRange();

  const stats = [
    {
      label: "Total Repositories",
      value: contributionStats
        ? String(contributionStats.totalRepositoriesContributedTo)
        : "—",
      sub: "Contributed to this year",
      icon: GitBranchIcon,
      accent: false,
    },
    {
      label: "Total Commits",
      value: contributionStats
        ? String(contributionStats.totalCommits)
        : "—",
      sub: `In the last year ${range}`,
      icon: GitCommitHorizontalIcon,
      accent: false,
    },
    {
      label: "Pull Requests",
      value: contributionStats
        ? String(contributionStats.totalPullRequests)
        : "—",
      sub: `In the last year ${range}`,
      icon: GitPullRequestIcon,
      accent: false,
    },
    {
      label: "AI Reviews",
      value: String(totalReviews),
      sub: "Completed reviews",
      icon: MessageSquareIcon,
      accent: true,
    },
  ];

  return (
    <div className="mt-8 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 xl:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="min-w-[200px] shrink-0 rounded-2xl border border-(--kc-border-subtle) bg-card p-5 sm:min-w-0 sm:shrink"
        >
          <div className="flex items-start justify-between">
            <span className="text-[13px] font-medium text-(--kc-text-muted)">
              {s.label}
            </span>
            <s.icon
              className={`size-[17px] text-(--kc-text-dim) ${s.accent ? "text-kc-amber" : ""}`}
            />
          </div>
          <div
            className={`mt-5 font-mono text-[30px] font-bold ${
              s.accent ? "text-kc-amber" : ""
            }`}
          >
            {s.value}
          </div>
          <div className="mt-1 text-[12px] text-(--kc-text-dim)">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
