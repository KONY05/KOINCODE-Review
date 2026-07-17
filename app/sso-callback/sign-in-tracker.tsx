"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { initMixpanelClient, trackClient } from "@/lib/analytics/mixpanel";
import { EVENTS } from "@/lib/analytics/events";

export function SignInTracker() {
  const searchParams = useSearchParams();
  // This route is also used to complete linking an additional git provider
  // (Settings > Connections > Connect GitLab) onto an already-signed-in
  // user — that's not a new sign-in and shouldn't count as one.
  const isLinkingFlow = searchParams.get("intent") === "link";

  useEffect(() => {
    if (isLinkingFlow) return;

    initMixpanelClient();
    trackClient(EVENTS.USER_SIGNED_IN);
  }, [isLinkingFlow]);

  return null;
}
