"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GitPullRequestArrowIcon } from "lucide-react";

import { fetchReviews, type ReviewEntry } from "@/lib/actions/reviews";
import ReviewItem from "./ReviewItem";
import ReviewItemSkeleton from "./ReviewItemSkeleton";

type ReviewListProps = {
  initialReviews: ReviewEntry[];
  initialHasNextPage: boolean;
};

export default function ReviewList({
  initialReviews,
  initialHasNextPage,
}: ReviewListProps) {
  const [reviews, setReviews] = useState(initialReviews);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasNextPage || reviews.length === 0) return;
    setLoading(true);

    const cursor = reviews[reviews.length - 1].createdAt;
    const result = await fetchReviews(cursor);

    if (result.success) {
      setReviews((prev) => [...prev, ...result.data.reviews]);
      setHasNextPage(result.data.hasNextPage);
    } else {
      setHasNextPage(false);
    }
    setLoading(false);
  }, [loading, hasNextPage, reviews]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !loading) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, loading, loadMore]);

  if (reviews.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-(--kc-border-subtle) p-12 text-center">
        <GitPullRequestArrowIcon className="mx-auto size-10 text-(--kc-text-dim)" />
        <p className="mt-4 text-[15px] font-medium text-(--kc-text-muted)">
          No reviews yet
        </p>
        <p className="mt-1.5 text-[13px] text-(--kc-text-dim)">
          AI reviews will appear here once you connect a repository and open a
          pull request.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {reviews.map((review) => (
          <ReviewItem key={review.id} review={review} />
        ))}

        {loading &&
          Array.from({ length: 2 }).map((_, i) => (
            <ReviewItemSkeleton key={`loading-${i}`} />
          ))}
      </div>

      {hasNextPage && <div ref={sentinelRef} className="h-px" />}
    </>
  );
}
