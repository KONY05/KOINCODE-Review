"use client";

import { useEffect } from "react";

import { initMixpanelClient, trackClient } from "@/lib/analytics/mixpanel";
import { EVENTS } from "@/lib/analytics/events";

export function SignInTracker() {
  useEffect(() => {
    initMixpanelClient();
    trackClient(EVENTS.USER_SIGNED_IN);
  }, []);

  return null;
}
