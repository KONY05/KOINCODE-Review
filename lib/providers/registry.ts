import type { GitProvider, GitProviderId } from "./types";
import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";

const providers: Record<GitProviderId, GitProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export function getProvider(id: GitProviderId): GitProvider {
  return providers[id];
}
