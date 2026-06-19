import { listGithubRepos } from "@/lib/actions/repos";
import RepoList from "@/components/Repository/RepoList";

export default async function ReposPage() {
  const result = await listGithubRepos(1, 20);

  const initialRepos = result.success ? result.data.repos : [];
  const initialHasNextPage = result.success ? result.data.hasNextPage : false;
  const initialError = result.success ? null : result.error;

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <RepoList
        initialRepos={initialRepos}
        initialHasNextPage={initialHasNextPage}
        initialError={initialError}
      />
    </div>
  );
}
