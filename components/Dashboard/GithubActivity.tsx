import { Skeleton } from "../ui/skeleton";

export default function GithubActivity() {
  return <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
        <h3 className="text-[17px] font-semibold">Contribution Activity</h3>
        <p className="mt-1 text-[13.5px] text-(--kc-text-secondary)">
          Visualizing your coding frequency over the last year
        </p>
        <div className="mt-6 flex flex-col items-center gap-4">
          <Skeleton className="h-[120px] w-full max-w-[700px] rounded-xl" />
          <p className="text-[13px] text-(--kc-text-dim)">
            Connect a repository to start tracking activity
          </p>
        </div>
      </div>
}