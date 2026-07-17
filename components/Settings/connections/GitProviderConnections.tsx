"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { GitBranchIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

type LinkableProvider = {
  id: "github" | "gitlab";
  label: string;
  strategy: "oauth_github" | "oauth_gitlab";
  additionalScopes?: string[];
};

// Every existing account today necessarily signed up via GitHub (the
// landing page only offers that one button), so this always renders as
// connected for now. Listed the same way as GitLab rather than hardcoded
// as a permanently-connected row — once Feature 20 lands the multi-provider
// sign-in picker, an account could exist with GitLab as its primary
// connection and no GitHub link at all, and this needs to offer "Connect
// GitHub" in that case instead of lying about it.
const LINKABLE_PROVIDERS: LinkableProvider[] = [
  { id: "github", label: "GitHub", strategy: "oauth_github" },
  {
    id: "gitlab",
    label: "GitLab",
    strategy: "oauth_gitlab",
    // GitLab's default/minimal OAuth scope doesn't cover what
    // lib/providers/gitlab/* actually needs — creating webhooks, posting
    // discussions/notes, and setting commit statuses are all write
    // operations that require the `api` scope (`read_api` alone isn't
    // enough). Requested explicitly here since Clerk's dashboard-level
    // default scope for a new social connection is read-oriented.
    additionalScopes: ["api"],
  },
];

export default function GitProviderConnections() {
  const { user, isLoaded } = useUser();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  async function handleConnect(provider: LinkableProvider) {
    if (!user) return;

    setConnectingId(provider.id);
    try {
      const externalAccount = await user.createExternalAccount({
        strategy: provider.strategy,
        additionalScopes: provider.additionalScopes,
        // ?intent=link tells /sso-callback's SignInTracker this isn't a
        // fresh sign-in — reusing the same callback route as the initial
        // OAuth flow, just linking a provider onto an already-signed-in user.
        redirectUrl: "/sso-callback?intent=link",
      });

      const redirectUrl = externalAccount.verification?.externalVerificationRedirectURL;
      if (redirectUrl) {
        window.location.assign(redirectUrl.href);
        return;
      }

      toast.error("Could not start the connection — please try again.");
      setConnectingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect.");
      setConnectingId(null);
    }
  }

  const connectedProviders = new Set(
    user?.externalAccounts.map((account) => account.provider) ?? [],
  );

  return (
    <div className="mt-8 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
      <h3 className="flex items-center gap-2.5 text-[18px] font-semibold">
        <GitBranchIcon className="size-[18px] text-kc-amber" />
        Git Providers
      </h3>
      <p className="mt-1.5 text-[13.5px] text-(--kc-text-secondary)">
        Connect additional git hosts to review repositories beyond your primary sign-in account.
      </p>

      <div className="mt-6 space-y-3">
        {LINKABLE_PROVIDERS.map((provider) => {
          const isConnected = connectedProviders.has(provider.id);
          const isConnecting = connectingId === provider.id;

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-[14px] border border-(--kc-border-subtle) px-5 py-4"
            >
              <span className="text-[13.5px] font-semibold">{provider.label}</span>
              {isConnected ? (
                <span className="flex items-center gap-1.5 rounded-full border border-[rgba(63,185,80,0.35)] bg-[rgba(63,185,80,0.1)] px-2.5 py-0.5 font-mono text-[11px] text-kc-green">
                  <CheckIcon className="size-3" />
                  connected
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect(provider)}
                  disabled={!isLoaded || isConnecting}
                  className="flex items-center gap-2 rounded-[9px] border-none bg-(--kc-cream) px-4 py-2 text-[13px] font-semibold text-(--kc-cream-text) transition-colors hover:bg-(--kc-cream-hover) disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isConnecting && <Loader2Icon className="size-3.5 animate-spin" />}
                  Connect {provider.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
