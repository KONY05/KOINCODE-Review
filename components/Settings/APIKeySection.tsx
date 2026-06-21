import { KeyIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "../ui/skeleton";

export default function APIKeySection() {
  return (
    <div className="rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2.5 text-[18px] font-semibold">
            <KeyIcon className="size-[18px] text-kc-amber" />
            API Keys
          </h3>
          <p className="mt-1.5 text-[13.5px] text-(--kc-text-secondary)">
            Bring your own key. Add a provider, then set one model active to
            power reviews.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="flex items-center gap-2 rounded-[10px] bg-(--kc-cream) px-4 py-2.5 text-[13.5px] font-semibold text-(--kc-cream-text) transition-colors hover:bg-(--kc-cream-hover)"
        >
          <PlusIcon className="size-[15px]" />
          Add Key
        </Link>
      </div>

      {/* Key rows placeholder */}
      <div className="mt-6 flex flex-col gap-3.5">
        <div className="rounded-[14px] border border-(--kc-border-subtle) bg-(--kc-bg) p-5">
          <div className="flex items-center gap-3.5">
            <Skeleton className="size-10 rounded-[11px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="mt-2 h-3 w-48 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="size-[34px] rounded-lg" />
              <Skeleton className="size-[34px] rounded-lg" />
            </div>
          </div>
          <Skeleton className="mt-3.5 h-10 w-full rounded-lg" />
        </div>
      </div>

      <p className="mt-5 text-center text-[13px] text-(--kc-text-dim)">
        No API keys configured yet. Add one to start reviewing PRs.
      </p>
    </div>
  );
}