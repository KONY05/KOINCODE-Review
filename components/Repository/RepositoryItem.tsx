"use client";

import { useState } from "react";
import { ExternalLinkIcon, StarIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";

import type { RepoWithStatus } from "@/lib/actions/repos";
import { connectRepo, disconnectRepo } from "@/lib/actions/repos";
import { formatRelativeTime } from "@/lib/utils";
import { LANGUAGE_COLORS } from "@/lib/constants";
import { toast } from "sonner";

type RepositoryItemProps = {
  repo: RepoWithStatus;
};

export default function RepositoryItem({ repo }: RepositoryItemProps) {
  const [connected, setConnected] = useState(repo.isConnected);
  const [loading, setLoading] = useState(false);

  const langColor = repo.language
    ? LANGUAGE_COLORS[repo.language] ?? "#7e858f"
    : null;

  async function handleToggle() {
    setLoading(true);
    setConnected(!connected);

    const result = connected
      ? await disconnectRepo(repo.githubId)
      : await connectRepo(repo);

    if (result.success) {
      toast.success(connected ? "Repository disconnected." : "Repository connected.");
    } else {
      setConnected(connected);
      toast.error(result.error);
    }

    setLoading(false);
  }

  return (
    <div className="group flex items-center gap-5 rounded-2xl border border-(--kc-border-subtle) bg-card p-5 transition-colors hover:border-[rgba(245,166,35,0.4)] hover:bg-[#11161e] dark:hover:bg-[#11161e]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[17px] font-bold">{repo.name}</span>
          {repo.language && langColor && (
            <span className="flex items-center gap-1.5 rounded-full border border-(--kc-border) px-2.5 py-0.5 font-mono text-[11px] text-(--kc-text-faint)">
              <span
                className="size-2 rounded-full"
                style={{ background: langColor }}
              />
              {repo.language}
            </span>
          )}
          {connected && (
            <span className="rounded-full border border-[rgba(63,185,80,0.35)] bg-[rgba(63,185,80,0.1)] px-2.5 py-0.5 font-mono text-[11px] text-kc-green">
              connected
            </span>
          )}
          {repo.isPrivate && (
            <span className="rounded-full border border-(--kc-border) px-2.5 py-0.5 font-mono text-[11px] text-(--kc-text-dim)">
              private
            </span>
          )}
        </div>
        {repo.description && (
          <p className="mt-2.5 max-w-[620px] text-[13.5px] text-(--kc-text-secondary)">
            {repo.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-4 font-mono text-[12.5px] text-(--kc-text-dim)">
          <span className="flex items-center gap-1.5">
            <StarIcon className="size-[13px] fill-kc-amber stroke-none" />
            {repo.stargazersCount.toLocaleString()}
          </span>
          <span>updated {formatRelativeTime(repo.updatedAt)}</span>
        </div>
      </div>

      <Link
        href={repo.htmlUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-(--kc-border) text-(--kc-text-muted) transition-colors hover:border-[rgba(255,255,255,0.25)] hover:text-foreground"
      >
        <ExternalLinkIcon className="size-4" />
      </Link>

      <button
        onClick={handleToggle}
        disabled={loading}
        className={`shrink-0 rounded-[9px] px-5 py-2.5 text-[13.5px] font-semibold cursor-pointer transition-colors ${
          connected
            ? "border border-(--kc-border) bg-transparent text-(--kc-text-faint) hover:border-[rgba(245,166,35,0.5)] hover:text-foreground"
            : "border-none bg-(--kc-cream) text-(--kc-cream-text) hover:bg-(--kc-cream-hover)"
        } disabled:opacity-50`}
      >
        {loading ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : connected ? (
          "Disconnect"
        ) : (
          "Connect"
        )}
      </button>
    </div>
  );
}
