"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Loader2Icon } from "lucide-react";

import { PROVIDER_ICONS } from "@/components/provider-icons";
import { PROVIDER_CLERK_CONFIG } from "@/lib/providers/clerk-mapping";
import type { GitProviderId } from "@/lib/providers/types";

type Props = {
  redirectUrlComplete?: string;
};

/**
 * Landing page's sign-in picker — replaces the single "Continue with
 * GitHub" button (still used as-is by app/cli-auth/page.tsx, which is
 * deliberately GitHub-only per the CLI integration's current scope).
 *
 * Unlike GitProviderConnections.tsx's createExternalAccount() (used when
 * linking a second provider onto an already-signed-in user),
 * signIn.authenticateWithRedirect() has no additionalScopes param at all —
 * checked against Clerk's own AuthenticateWithRedirectParams type. That
 * means a brand-new GitLab/Azure DevOps-first signup gets whatever scopes
 * are configured as that connection's default "Scopes" field in Clerk's
 * dashboard, with no code-level way to request more at sign-in time. This
 * makes that dashboard field load-bearing for first sign-ins, not just
 * defense-in-depth the way it is for the linking flow.
 */
export function ProviderSignInButtons({ redirectUrlComplete = "/dashboard" }: Props) {
  const clerk = useClerk();
  const [connectingId, setConnectingId] = useState<GitProviderId | null>(null);

  async function handleClick(providerId: GitProviderId) {
    if (!clerk.client) return;
    const config = PROVIDER_CLERK_CONFIG[providerId];

    setConnectingId(providerId);
    try {
      await clerk.client.signIn.authenticateWithRedirect({
        strategy: config.strategy,
        // ?provider= lets SignInTracker attribute the USER_SIGNED_IN
        // Mixpanel event to whichever provider was actually clicked —
        // Clerk's redirect flow doesn't otherwise expose that back to us.
        redirectUrl: `/sso-callback?provider=${providerId}`,
        redirectUrlComplete,
      });
    } catch {
      setConnectingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {Object.values(PROVIDER_CLERK_CONFIG).map((config) => {
        const Icon = PROVIDER_ICONS[config.id];
        const isConnecting = connectingId === config.id;

        return (
          <button
            key={config.id}
            onClick={() => handleClick(config.id)}
            disabled={!!connectingId}
            className="w-full flex items-center justify-center gap-3 bg-(--kc-cream) text-(--kc-cream-text) rounded-xl py-4 text-[15px] font-semibold cursor-pointer transition-colors hover:bg-(--kc-cream-hover) disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <Loader2Icon className="size-[18px] animate-spin" />
            ) : (
              <Icon className="size-[18px]" />
            )}
            Continue with {config.label}
          </button>
        );
      })}
    </div>
  );
}
