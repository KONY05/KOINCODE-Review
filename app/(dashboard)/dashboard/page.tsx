import Stats from "@/components/Dashboard/Stats";
import GithubActivity from "@/components/Dashboard/GithubActivity";
import ActivityOverview from "@/components/Dashboard/ActivityOverview";
import { getGithubToken } from "@/lib/github";
import { getContributions } from "@/lib/github/contributions";
import {
  fetchReviewsSummary,
  fetchMonthlyReviewCounts,
} from "@/lib/actions/reviews";

export default async function DashboardPage() {
  const [token, summaryResult, monthlyResult] = await Promise.all([
    getGithubToken(),
    fetchReviewsSummary(),
    fetchMonthlyReviewCounts(),
  ]);

  const contributions = token ? await getContributions(token) : null;

  const totalReviews = summaryResult.success ? summaryResult.data.completed : 0;
  const monthlyReviews = monthlyResult.success ? monthlyResult.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">Dashboard</h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Overview of your coding activity and AI reviews
      </p>

      <Stats
        contributionStats={contributions?.stats ?? null}
        totalReviews={totalReviews}
      />

      <GithubActivity calendar={contributions?.calendar ?? null} />

      <ActivityOverview
        monthlyActivity={contributions?.monthlyActivity ?? null}
        monthlyReviews={monthlyReviews}
      />
    </div>
  );
}
