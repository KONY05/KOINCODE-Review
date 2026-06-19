import { ExternalLinkIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function RepositoryItemSkeleton() {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-(--kc-border-subtle) bg-card p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-4 w-3/4 rounded" />
        <div className="mt-3 flex items-center gap-4">
          <Skeleton className="h-3.5 w-14 rounded" />
          <Skeleton className="h-3.5 w-24 rounded" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex size-[38px] items-center justify-center rounded-[10px] border border-(--kc-border) text-(--kc-text-muted)">
          <ExternalLinkIcon className="size-4" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>
  );
}
