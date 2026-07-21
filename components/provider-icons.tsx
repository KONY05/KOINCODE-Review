import type { GitProviderId } from "@/lib/providers/types";
import GitHubIcon from "@/components/icon/GithubIcon";
import GitlabIcon from "@/components/icon/GitlabIcon";
import MicrosoftIcon from "@/components/icon/MicrosoftIcon";

// Azure DevOps rides on Clerk's "microsoft" connection (see
// lib/providers/clerk-mapping.ts), so it gets the Microsoft brand mark here
// rather than an Azure DevOps-specific one — that's what the user is
// actually authenticating through.
export const PROVIDER_ICONS: Record<GitProviderId, React.ComponentType<{ className?: string }>> = {
  github: GitHubIcon,
  gitlab: GitlabIcon,
  azure_devops: MicrosoftIcon,
};
