import type { Metadata } from "next";

import Stats from "@/components/Dashboard/Stats";
import ReviewActivity from "@/components/Dashboard/ReviewActivity";
import ActivityOverview from "@/components/Dashboard/ActivityOverview";
import {
  fetchDashboardStats,
  fetchDailyReviewCounts,
  fetchMonthlyReviewCounts,
} from "@/lib/actions/reviews";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [statsResult, dailyResult, monthlyResult] = await Promise.all([
    fetchDashboardStats(),
    fetchDailyReviewCounts(),
    fetchMonthlyReviewCounts(),
  ]);

  const stats = statsResult.success ? statsResult.data : null;
  const dailyReviews = dailyResult.success ? dailyResult.data : null;
  const monthlyReviews = monthlyResult.success ? monthlyResult.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">Dashboard</h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Overview of your coding activity and AI reviews
      </p>

      <Stats stats={stats} />

      <ReviewActivity dailyReviews={dailyReviews} />

      <ActivityOverview monthlyReviews={monthlyReviews} />
    </div>
  );
}
