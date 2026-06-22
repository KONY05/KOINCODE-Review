import APIKeySection from "@/components/Settings/APIKeySection";
import RepoMemorySection from "@/components/Settings/RepoMemorySection";
import { getApiKeys } from "@/lib/actions/api-keys";
import { getRepoMemories, getConnectedRepos } from "@/lib/actions/repo-memories";

export default async function SettingsPage() {
  const [keysResult, memoriesResult, reposResult] = await Promise.all([
    getApiKeys(),
    getRepoMemories(),
    getConnectedRepos(),
  ]);

  const keys = keysResult.success ? keysResult.data : [];
  const { memories, totalCount, pageCount } = memoriesResult.success
    ? memoriesResult.data
    : { memories: [], totalCount: 0, pageCount: 1 };
  const repoOptions = reposResult.success ? reposResult.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">Settings</h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Manage the models that power your code reviews
      </p>

      <APIKeySection keys={keys} />

      <RepoMemorySection
        memories={memories}
        totalCount={totalCount}
        pageCount={pageCount}
        repoOptions={repoOptions}
      />
    </div>
  );
}
