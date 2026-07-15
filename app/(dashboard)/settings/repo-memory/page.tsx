import type { Metadata } from "next";

import RepoMemorySection from "@/components/Settings/repo-memories/RepoMemorySection";
import {
  getRepoMemories,
  getConnectedRepos,
} from "@/lib/actions/repo-memories";

export const metadata: Metadata = { title: "Repository Memory" };

export default async function RepoMemorySettingsPage() {
  const [memoriesResult, reposResult] = await Promise.all([
    getRepoMemories(),
    getConnectedRepos(),
  ]);

  const { memories, totalCount, pageCount } = memoriesResult.success
    ? memoriesResult.data
    : { memories: [], totalCount: 0, pageCount: 1 };
  const repoOptions = reposResult.success ? reposResult.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">
        Repository Memory
      </h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Per-repo conventions the reviewer always checks
      </p>

      <RepoMemorySection
        memories={memories}
        totalCount={totalCount}
        pageCount={pageCount}
        repoOptions={repoOptions}
      />
    </div>
  );
}
