"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { initMixpanelClient, trackClient } from "@/lib/analytics/mixpanel";
import { EVENTS } from "@/lib/analytics/events";
import { backfillGitUsernameIfMissing } from "@/lib/actions/user";

export function SignInTracker() {
  const searchParams = useSearchParams();
  // This route is also used to complete linking an additional git provider
  // (Settings > Connections > Connect GitLab) onto an already-signed-in
  // user — that's not a new sign-in and shouldn't count as one.
  const isLinkingFlow = searchParams.get("intent") === "link";
  // Set by both sign-in button components (?provider=github/gitlab/...) —
  // Clerk's own redirect flow doesn't expose which provider was used back
  // to us any other way.
  const provider = searchParams.get("provider");

  useEffect(() => {
    if (isLinkingFlow) {
      // Covers e.g. an Azure DevOps-first signup (whose OAuth profile has
      // no username field at all) linking GitHub/GitLab for the first time.
      backfillGitUsernameIfMissing();
      return;
    }

    initMixpanelClient();
    trackClient(EVENTS.USER_SIGNED_IN, provider ? { provider } : undefined);
  }, [isLinkingFlow, provider]);

  return null;
}
