"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { GitBranchIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { PROVIDER_CLERK_CONFIG, type ProviderClerkConfig } from "@/lib/providers/clerk-mapping";
import { PROVIDER_ICONS } from "@/components/provider-icons";
import { disconnectAllReposForProvider } from "@/lib/actions/repos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Every existing account today necessarily signed up via GitHub (the
// landing page only offers that one button), so this always renders as
// connected for now. Listed the same way as GitLab/Azure DevOps rather than
// hardcoded as a permanently-connected row — once the multi-provider sign-in
// picker lands (Feature 20), an account could exist with GitLab or Azure
// DevOps as its primary connection and no GitHub link at all, and this
// needs to offer "Connect GitHub" in that case instead of lying about it.
const LINKABLE_PROVIDERS = Object.values(PROVIDER_CLERK_CONFIG);

export default function GitProviderConnections() {
  const { user, isLoaded } = useUser();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ProviderClerkConfig | null>(null);

  async function handleConnect(provider: ProviderClerkConfig) {
    if (!user) return;

    setPendingId(provider.id);
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
      setPendingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect.");
      setPendingId(null);
    }
  }

  async function confirmDisconnect(provider: ProviderClerkConfig) {
    if (!user) return;

    const externalAccount = user.externalAccounts.find(
      (account) => account.provider === provider.clerkProviderSlug,
    );
    setDisconnectTarget(null);
    if (!externalAccount) return;

    setPendingId(provider.id);
    try {
      // Deactivate every repo connected through this provider (and delete
      // their webhooks) *before* destroying the Clerk link — the token
      // needed to delete webhooks is only retrievable while the link still
      // exists. Without this ordering, disconnecting the account wouldn't
      // actually stop reviews: webhooks would keep firing and reviews would
      // silently get stuck instead of failing cleanly.
      const disconnectResult = await disconnectAllReposForProvider(provider.id);
      if (!disconnectResult.success) {
        toast.error(disconnectResult.error);
        return;
      }

      // Clerk itself refuses to destroy() a user's only remaining sign-in
      // method (throws instead) — no extra guard needed here for the
      // "would lock myself out" case.
      await externalAccount.destroy();
      toast.success(`${provider.label} disconnected.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect.");
    } finally {
      setPendingId(null);
    }
  }

  // Checked against Clerk's own provider slug, not our internal
  // GitProviderId — Azure DevOps's externalAccounts entry says "microsoft",
  // not "azure_devops".
  const connectedSlugs = new Set(
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
          const isConnected = connectedSlugs.has(provider.clerkProviderSlug);
          const isPending = pendingId === provider.id;
          const Icon = PROVIDER_ICONS[provider.id];

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-[14px] border border-(--kc-border-subtle) px-5 py-4"
            >
              <span className="flex items-center gap-2.5 text-[13.5px] font-semibold">
                <Icon className="size-[18px]" />
                {provider.label}
              </span>
              {isConnected ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full border border-[rgba(63,185,80,0.35)] bg-[rgba(63,185,80,0.1)] px-2.5 py-0.5 font-mono text-[11px] text-kc-green">
                    <CheckIcon className="size-3" />
                    connected
                  </span>
                  <button
                    type="button"
                    onClick={() => setDisconnectTarget(provider)}
                    disabled={!isLoaded || isPending}
                    title={`Disconnect ${provider.label}`}
                    className="flex size-[26px] items-center justify-center rounded-full border border-(--kc-border) text-(--kc-text-faint) transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isPending ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <XIcon className="size-3" />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect(provider)}
                  disabled={!isLoaded || isPending}
                  className="flex items-center gap-2 rounded-[9px] border-none bg-(--kc-cream) px-4 py-2 text-[13px] font-semibold text-(--kc-cream-text) transition-colors hover:bg-(--kc-cream-hover) disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isPending && <Loader2Icon className="size-3.5 animate-spin" />}
                  Connect {provider.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnectTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every repo connected through <strong>{disconnectTarget?.label} </strong> will be disconnected too —
              their webhooks are removed and they&apos;ll stop receiving reviews. You&apos;ll
              need to reconnect them individually afterward, even after reconnecting{" "}
              <strong>{disconnectTarget?.label}</strong> itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => disconnectTarget && confirmDisconnect(disconnectTarget)}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
