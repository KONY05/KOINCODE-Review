"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import type { MemoryRow } from "@/lib/actions/repo-memories";
import { RepoMemoryTable } from "./RepoMemoryTable";
import { AddMemoryDialog } from "./AddMemoryDialog";

type RepoOption = { id: string; fullName: string };

export default function RepoMemorySection({
  memories,
  totalCount,
  pageCount,
  repoOptions,
}: {
  memories: MemoryRow[];
  totalCount: number;
  pageCount: number;
  repoOptions: RepoOption[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleAdded() {
    setDialogOpen(false);
    toast.success("Memory added.");
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2.5 text-[18px] font-semibold">
            <BotIcon className="size-[18px] text-kc-amber" />
            Repository Memory
          </h3>
          <p className="mt-1.5 text-[13.5px] text-(--kc-text-secondary)">
            Per-repo conventions the reviewer always checks. Reply to a review
            comment on GitHub or add rules manually.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-[10px] bg-(--kc-cream) px-4 py-2.5 text-[13.5px] font-semibold text-(--kc-cream-text) transition-colors hover:bg-(--kc-cream-hover) cursor-pointer"
        >
          <PlusIcon className="size-[15px]" />
          Add Rule
        </button>
      </div>

      {memories.length > 0 || totalCount > 0 ? (
        <RepoMemoryTable
          key={refreshKey}
          initialMemories={memories}
          initialPageCount={pageCount}
          initialTotalCount={totalCount}
        />
      ) : (
        <p className="mt-5 text-center text-[13px] text-(--kc-text-dim)">
          No memories yet. Reply to a review comment on GitHub to teach the
          reviewer, or add a rule manually.
        </p>
      )}

      <AddMemoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        repoOptions={repoOptions}
        onAdded={handleAdded}
      />
    </div>
  );
}
