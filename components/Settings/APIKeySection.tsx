import { KeyIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import type { ApiKeyRow } from "@/lib/actions/api-keys";
import { APIKeyTable } from "./APIKeyTable";

export default function APIKeySection({ keys }: { keys: ApiKeyRow[] }) {

  return (
    <div className="mt-8 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
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

      {keys.length > 0 ? (
        <APIKeyTable keys={keys} />
      ) : (
        <p className="mt-5 text-center text-[13px] text-(--kc-text-dim)">
          No API keys configured yet. Add one to start reviewing PRs.
        </p>
      )}
    </div>
  );
}
