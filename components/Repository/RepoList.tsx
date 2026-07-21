"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { RepoWithStatus } from "@/lib/actions/repos";
import { listProviderRepos, listConnectedRepos } from "@/lib/actions/repos";
import type { GitProviderId } from "@/lib/providers/types";
import { PROVIDER_CLERK_CONFIG } from "@/lib/providers/clerk-mapping";
import RepoSearchInput from "./RepoSearchInput";
import RepoTabs from "./RepoTabs";
import ProviderSelector from "./ProviderSelector";
import RepositoryItem from "./RepositoryItem";
import RepositoryItemSkeleton from "./RepositoryItemSkeleton";

type Tab = "all" | "connected";

type RepoListProps = {
  initialRepos: RepoWithStatus[];
  initialHasNextPage: boolean;
  initialError: string | null;
  initialProvider: GitProviderId;
  availableProviders: GitProviderId[];
};

export default function RepoList({
  initialRepos,
  initialHasNextPage,
  initialError,
  initialProvider,
  availableProviders,
}: RepoListProps) {
  const router = useRouter();
  const [provider, setProvider] = useState(initialProvider);
  const [tab, setTab] = useState<Tab>("all");
  const [repos, setRepos] = useState(initialRepos);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [initialLoading, setInitialLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const providerLabel = PROVIDER_CLERK_CONFIG[provider].label;

  const displayedRepos = useMemo(() => {
    if (tab === "all" && search) {
      return repos.filter((r) =>
        r.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    return repos;
  }, [repos, tab, search]);

  const fetchRepos = useCallback(
    async (
      pageNum: number,
      query: string,
      currentTab: Tab,
      currentProvider: GitProviderId,
      append: boolean
    ) => {
      if (append) {
        setLoading(true);
      } else {
        setInitialLoading(true);
      }
      setError(null);

      const result =
        currentTab === "all"
          ? await listProviderRepos(currentProvider, pageNum)
          : await listConnectedRepos(pageNum, 20, query || undefined);

      if (!result.success) {
        setError(result.error);
        if (!append) setRepos([]);
        setHasNextPage(false);
        setLoading(false);
        setInitialLoading(false);
        return;
      }

      if (append) {
        setRepos((prev) => [...prev, ...result.data.repos]);
      } else {
        setRepos(result.data.repos);
      }

      setHasNextPage(result.data.hasNextPage);
      setLoading(false);
      setInitialLoading(false);
    },
    []
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchRepos(nextPage, search, tab, provider, true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, loading, page, search, tab, provider, fetchRepos]);

  const handleTabChange = useCallback(
    (newTab: Tab) => {
      setTab(newTab);
      setSearch("");
      setPage(1);
      setRepos([]);
      setHasNextPage(false);
      setError(null);
      fetchRepos(1, "", newTab, provider, false);
    },
    [fetchRepos, provider]
  );

  const handleProviderChange = useCallback(
    (newProvider: GitProviderId) => {
      setProvider(newProvider);
      setTab("all");
      setSearch("");
      setPage(1);
      setRepos([]);
      setHasNextPage(false);
      setError(null);
      fetchRepos(1, "", "all", newProvider, false);
      router.replace(`/repos?provider=${newProvider}`, { scroll: false });
    },
    [fetchRepos, router]
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearch(query);
      if (tab === "connected") {
        setPage(1);
        fetchRepos(1, query, tab, provider, false);
      }
    },
    [tab, provider, fetchRepos]
  );

  const showEmpty = !initialLoading && !error && displayedRepos.length === 0;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-bold tracking-[-0.02em]">
            Repositories
          </h1>
          <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
            Manage and view all your {providerLabel} repositories
          </p>
        </div>
        <RepoTabs activeTab={tab} onTabChange={handleTabChange} />
      </div>

      {availableProviders.length > 1 && tab === "all" && (
        <div className="mt-4">
          <ProviderSelector
            providers={availableProviders}
            activeProvider={provider}
            onProviderChange={handleProviderChange}
          />
        </div>
      )}

      <div className="mt-8">
        <RepoSearchInput onSearch={handleSearch} />
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13.5px] text-red-400">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {initialLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <RepositoryItemSkeleton key={i} />
            ))
          : displayedRepos.map((repo) => (
              <RepositoryItem key={`${repo.provider}-${repo.externalId}`} repo={repo} />
            ))}

        {loading &&
          Array.from({ length: 2 }).map((_, i) => (
            <RepositoryItemSkeleton key={`loading-${i}`} />
          ))}
      </div>

      {showEmpty && (
        <p className="mt-8 text-center text-[13px] text-(--kc-text-dim)">
          {tab === "all"
            ? search
              ? `No repositories matching "${search}".`
              : `No repositories found. Make sure your ${providerLabel} account has accessible repositories.`
            : search
              ? `No connected repositories matching "${search}".`
              : "No connected repositories yet. Connect a repo to start receiving AI reviews."}
        </p>
      )}

      {hasNextPage && <div ref={sentinelRef} className="h-px" />}
    </>
  );
}
