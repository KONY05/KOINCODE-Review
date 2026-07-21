import type { GitProviderId } from "./types";

export type ClerkOAuthStrategy = "oauth_github" | "oauth_gitlab" | "oauth_microsoft";

export type ProviderClerkConfig = {
  id: GitProviderId;
  label: string;
  strategy: ClerkOAuthStrategy;
  // Clerk's externalAccount.provider slug — each strategy's own name minus
  // the "oauth_" prefix, except this doesn't disambiguate azure_devops from
  // a plain Microsoft sign-in, since both ride the same "microsoft"
  // connection (Azure DevOps has no distinct Clerk strategy of its own).
  clerkProviderSlug: "github" | "gitlab" | "microsoft";
  additionalScopes?: string[];
};

/**
 * The single source of truth for "which Clerk connection backs which
 * GitProviderId" — used by the account-linking UI (Settings), the repos
 * page (to know which providers a user has actually linked), and the
 * landing page's sign-in buttons, so the three don't drift out of sync on
 * scopes/strategy/labels.
 */
export const PROVIDER_CLERK_CONFIG: Record<GitProviderId, ProviderClerkConfig> = {
  github: {
    id: "github",
    label: "GitHub",
    strategy: "oauth_github",
    clerkProviderSlug: "github",
  },
  gitlab: {
    id: "gitlab",
    label: "GitLab",
    strategy: "oauth_gitlab",
    clerkProviderSlug: "gitlab",
    // GitLab's default/minimal OAuth scope doesn't cover what
    // lib/providers/gitlab/* actually needs — creating webhooks, posting
    // discussions/notes, and setting commit statuses are all write
    // operations that require the `api` scope (`read_api` alone isn't
    // enough).
    additionalScopes: ["api"],
  },
  azure_devops: {
    id: "azure_devops",
    label: "Azure DevOps",
    strategy: "oauth_microsoft",
    clerkProviderSlug: "microsoft",
    // Clerk's dashboard-level default scope for a new Microsoft connection
    // is basic sign-in (openid/profile/email), not Azure DevOps API access.
    // Requested again here as defense-in-depth alongside the same scopes
    // set in Clerk's dashboard Scopes field for this connection.
    additionalScopes: [
      "vso.project",
      "vso.code_full",
      "vso.code_status",
      "vso.threads_full",
      "vso.hooks_write",
    ],
  },
};

/**
 * Maps a Clerk externalAccount.provider slug back to our GitProviderId — the
 * inverse of PROVIDER_CLERK_CONFIG[id].clerkProviderSlug. Strips an optional
 * "oauth_" prefix first: Clerk's Backend API (currentUser(), webhooks) and
 * Frontend SDK (useUser()) disagree on this field's format — the backend
 * returns the full strategy string ("oauth_github"), the frontend returns
 * the bare slug ("github"). lib/actions/auth.ts's getAuthUser() already
 * works around this same inconsistency by checking both forms explicitly.
 */
export function gitProviderIdForClerkSlug(clerkProviderSlug: string): GitProviderId | null {
  const normalized = clerkProviderSlug.replace(/^oauth_/, "");
  const match = Object.values(PROVIDER_CLERK_CONFIG).find(
    (config) => config.clerkProviderSlug === normalized,
  );
  return match?.id ?? null;
}

/**
 * Picks a username for users.gitUsername from Clerk's externalAccounts —
 * used both at signup (Clerk's user.created webhook) and by
 * getAuthUser()'s fallback path for a missed webhook delivery. Not
 * GitHub-specific: checks any of GitHub/GitLab/Azure DevOps's linked
 * accounts, since signup can now happen via any of the three. In practice
 * there's normally exactly one external account at signup time, so simple
 * array order (rather than a fixed provider priority) is fine here.
 */
export function findSignupUsername(
  externalAccounts: { provider: string; username?: string | null }[],
): string | null {
  for (const account of externalAccounts) {
    if (gitProviderIdForClerkSlug(account.provider) && account.username) {
      return account.username;
    }
  }
  return null;
}
