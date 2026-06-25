"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import {
  initMixpanelClient,
  identifyUser,
  trackClient,
} from "@/lib/analytics/mixpanel";
import { EVENTS } from "@/lib/analytics/events";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    initMixpanelClient();
  }, []);

  useEffect(() => {
    if (!isLoaded || !user) return;

    identifyUser(user.id, {
      github_username: user.username,
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName,
    });
  }, [isLoaded, user]);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    const pageName = pathname.split("/").pop() || "dashboard";
    trackClient(EVENTS.PAGE_VIEWED, { page_name: pageName, path: pathname });
  }, [pathname]);

  return <>{children}</>;
}
