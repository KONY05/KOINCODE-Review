import type { GitProvider, GitProviderId } from "./types";
import { githubProvider } from "./github";

const providers: Record<GitProviderId, GitProvider> = {
  github: githubProvider,
};

export function getProvider(id: GitProviderId): GitProvider {
  return providers[id];
}
