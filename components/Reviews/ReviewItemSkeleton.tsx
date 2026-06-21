import { ExternalLinkIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewItemSkeleton() {
  return (
    <div className="rounded-2xl border border-(--kc-border-subtle) bg-card p-6">
      <div className="flex items-start gap-3.5">
        <Skeleton className="size-10 shrink-0 rounded-xl" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <Skeleton className="h-5 w-56 rounded" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-4 w-40 rounded" />
          <Skeleton className="mt-1.5 h-3.5 w-32 rounded" />
        </div>

        <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-(--kc-border) text-(--kc-text-muted)">
          <ExternalLinkIcon className="size-[15px]" />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-(--kc-border-subtle) bg-(--kc-bg) p-4">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="mt-2 h-4 w-4/5 rounded" />
        <Skeleton className="mt-2 h-4 w-3/5 rounded" />
      </div>
    </div>
  );
}
