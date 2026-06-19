import { Skeleton } from "../ui/skeleton";

export default function ActivityOverview() {
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
      </div>
  );
}