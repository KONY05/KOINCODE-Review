"use client";

import { usePathname } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const crumbs: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/repos": "Repositories",
  "/reviews": "Reviews",
  "/settings": "Settings",
};

export function DashboardHeader() {
  const pathname = usePathname();
  const label = crumbs[pathname] ?? "Dashboard";

  return (
    <header className="sticky top-0 z-5 flex h-[58px] shrink-0 items-center gap-4 border-b border-(--kc-border-subtle) bg-(--kc-bg)/86 px-7 backdrop-blur-sm">
      <SidebarTrigger className="text-(--kc-text-muted) hover:text-(--kc-text)" />
      <span className="font-mono text-[13px] text-(--kc-text-muted)">
        {label}
      </span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
