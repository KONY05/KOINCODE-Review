import type { GitProvider, GitProviderId } from "./types";
import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";
import { azureDevOpsProvider } from "./azure-devops";

const providers: Record<GitProviderId, GitProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
  azure_devops: azureDevOpsProvider,
};

export function getProvider(id: GitProviderId): GitProvider {
  return providers[id];
}
