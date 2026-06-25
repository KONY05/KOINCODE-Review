"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  initMixpanelClient,
  identifyUser,
  trackClient,
} from "@/lib/analytics/mixpanel";
import { EVENTS } from "@/lib/analytics/events";

type AnalyticsUser = {
  id: string;
  email: string;
  name: string;
  githubUsername: string;
};

export function AnalyticsProvider({
  user,
  children,
}: {
  user: AnalyticsUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    initMixpanelClient();
    identifyUser(user.id, {
      github_username: user.githubUsername,
      email: user.email,
      name: user.name,
    });
  }, [user]);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    const pageName = pathname.split("/").pop() || "dashboard";
    trackClient(EVENTS.PAGE_VIEWED, { page_name: pageName, path: pathname });
  }, [pathname]);

  return <>{children}</>;
}
