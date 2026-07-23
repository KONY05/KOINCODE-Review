"use client";

import { useSyncExternalStore } from "react";
import { formatRelativeTime } from "@/lib/utils";

function subscribe(callback: () => void) {
  const id = setInterval(callback, 60_000);
  return () => clearInterval(id);
}

export function RelativeTime({ dateString }: { dateString: string }) {
  const label = useSyncExternalStore(
    subscribe,
    () => formatRelativeTime(dateString),
    () => null
  );

  return <span suppressHydrationWarning>{label ?? " "}</span>;
}
