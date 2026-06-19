import ReviewItem from "@/components/Reviews/ReviewItem";

export default function ReviewsPage() {
  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">
        Review History
      </h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        View all AI code reviews
      </p>

      <div className="mt-7 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <ReviewItem key={i} />
        ))}
      </div>

      <p className="mt-8 text-center text-[13px] text-(--kc-text-dim)">
        AI reviews will appear here once you connect a repository and open a
        pull request.
      </p>
    </div>
  );
}
