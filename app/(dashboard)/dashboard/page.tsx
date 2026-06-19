import {
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
} from "lucide-react";

import Stats from "@/components/Dashboard/Stats";
import GithubActivity from "@/components/Dashboard/GithubActivity";
import ActivityOverview from "@/components/Dashboard/ActivityOverview";

const stats = [
  {
    label: "Total Repositories",
    value: "—",
    sub: "Connected repositories",
    icon: GitBranchIcon,
    accent: false,
  },
  {
    label: "Total Commits",
    value: "—",
    sub: "In the last year",
    icon: GitCommitHorizontalIcon,
    accent: false,
  },
  {
    label: "Pull Requests",
    value: "—",
    sub: "All time",
    icon: GitPullRequestIcon,
    accent: false,
  },
  {
    label: "AI Reviews",
    value: "—",
    sub: "Generated reviews",
    icon: MessageSquareIcon,
    accent: true,
  },
];

export default function DashboardPage() {
  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">Dashboard</h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Overview of your coding activity and AI reviews
      </p>

      <Stats stats={stats}/>

      {/* Activity placeholder */}
      <GithubActivity/>

      {/* Monthly overview placeholder */}
     <ActivityOverview/>
    </div>
  );
}
