import {
  CheckCircle2Icon,
  ClockIcon,
  GitPullRequestArrowIcon,
  XCircleIcon,
} from "lucide-react";

import ReviewList from "@/components/Reviews/ReviewList";
import { fetchReviews, fetchReviewsSummary } from "@/lib/actions/reviews";

const STAT_CARDS = [
  { key: "total", label: "Total Reviews", icon: GitPullRequestArrowIcon },
  { key: "completed", label: "Completed", icon: CheckCircle2Icon },
  { key: "pending", label: "Pending", icon: ClockIcon },
  { key: "failed", label: "Failed", icon: XCircleIcon },
] as const;

export default async function ReviewsPage() {
  const [reviewsResult, summaryResult] = await Promise.all([
    fetchReviews(),
    fetchReviewsSummary(),
  ]);

  const reviews = reviewsResult.success ? reviewsResult.data.reviews : [];
  const hasNextPage = reviewsResult.success ? reviewsResult.data.hasNextPage : false;
  const summary = summaryResult.success
    ? summaryResult.data
    : { total: 0, completed: 0, pending: 0, failed: 0 };

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">
        Review History
      </h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        View all AI code reviews across your connected repositories
      </p>

      <div className="mt-8 mb-8 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="min-w-[200px] shrink-0 rounded-2xl border border-(--kc-border-subtle) bg-card p-5 sm:min-w-0 sm:shrink"
          >
            <div className="flex items-start justify-between">
              <span className="text-[13px] font-medium text-(--kc-text-muted)">
                {card.label}
              </span>
              <card.icon className="size-[17px] text-(--kc-text-dim)" />
            </div>
            <div className="mt-5 font-mono text-[30px] font-bold">
              {summary[card.key].toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <ReviewList initialReviews={reviews} initialHasNextPage={hasNextPage} />
    </div>
  );
}
