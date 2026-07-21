import type { Metadata } from "next";

import { listProviderRepos, listLinkedProviders } from "@/lib/actions/repos";
import type { GitProviderId } from "@/lib/providers/types";
import RepoList from "@/components/Repository/RepoList";

export const metadata: Metadata = { title: "Repositories" };

function resolveProvider(
  requested: string | undefined,
  linkedProviders: GitProviderId[],
): GitProviderId {
  if (requested && linkedProviders.includes(requested as GitProviderId)) {
    return requested as GitProviderId;
  }
  // Falls back to "github" even if it isn't in linkedProviders — every
  // account created before the multi-provider sign-in picker existed is
  // GitHub-only, and a brand new GitHub-first signup's very first render
  // races Clerk's externalAccounts list before it's populated.
  return linkedProviders[0] ?? "github";
}

export default async function ReposPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const [{ provider: requestedProvider }, linkedProviders] = await Promise.all([
    searchParams,
    listLinkedProviders(),
  ]);

  const provider = resolveProvider(requestedProvider, linkedProviders);

  const result = await listProviderRepos(provider, 1, 20);

  const initialRepos = result.success ? result.data.repos : [];
  const initialHasNextPage = result.success ? result.data.hasNextPage : false;
  const initialError = result.success ? null : result.error;

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <RepoList
        initialProvider={provider}
        availableProviders={linkedProviders.length > 0 ? linkedProviders : ["github"]}
        initialRepos={initialRepos}
        initialHasNextPage={initialHasNextPage}
        initialError={initialError}
      />
    </div>
  );
}
