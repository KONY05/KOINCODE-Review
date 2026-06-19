import { SearchIcon } from "lucide-react";

import RepositoryItem from "@/components/Repository/RepositoryItem";

export default function ReposPage() {
  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">
        Repositories
      </h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Manage and view all your GitHub repositories
      </p>

      {/* TODO: ADD FILTER TAB FOR ALL / CONNECTED  */}

      {/* Search */}
      {/* TODO: IMPLEMENT SEARCH WITH QUERY SYNCING */}
      <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-(--kc-border) bg-card px-4 py-3.5">
        <SearchIcon className="size-[17px] text-(--kc-text-dim)" />
        <span className="text-[14.5px] text-(--kc-text-dim)">
          Search repositories...
        </span>
      </div>

      {/* Empty state */}
      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <RepositoryItem key={i}/>
        ))}
      </div>

      <p className="mt-8 text-center text-[13px] text-(--kc-text-dim)">
        Your GitHub repositories will appear here once the connection is set up.
      </p>
    </div>
  );
}
