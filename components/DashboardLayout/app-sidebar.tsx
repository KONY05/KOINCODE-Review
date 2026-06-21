"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  GitBranchIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  SettingsIcon,
} from "lucide-react";

import GitHubIcon from "@/components/icon/GithubIcon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/DashboardLayout/nav-user";

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Repositories", href: "/repos", icon: GitBranchIcon },
  { title: "Reviews", href: "/reviews", icon: MessageSquareIcon },
  { title: "Logs", href: "/logs", icon: ScrollTextIcon },
  { title: "Settings", href: "/settings", icon: SettingsIcon },
];

interface AppSidebarProps {
  user: {
    name: string | null;
    email: string;
    avatarUrl: string | null;
    githubUsername: string | null;
  };
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 rounded-xl border border-(--kc-border) bg-(--kc-surface) p-3 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent">
          <div className="flex size-[42px] shrink-0 items-center justify-center rounded-[11px] bg-(--kc-cream) text-(--kc-cream-text)">
            <GitHubIcon className="size-[22px]" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-[11px] font-medium text-(--kc-text-muted)">
              Connected Account
            </div>
            <div className="mt-0.5 truncate text-[13.5px] font-semibold leading-tight">
              @{user.githubUsername ?? user.name ?? "user"}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[11px] tracking-[0.18em] text-(--kc-text-dim)">
            MENU
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                      className="h-10 gap-3 rounded-[10px] px-3.5 text-[14.5px] data-active:border-l-2 data-active:border-l-kc-amber data-active:font-semibold"
                      render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
                    >
                      <item.icon className="size-[18px]" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-(--kc-border-subtle) p-3">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
