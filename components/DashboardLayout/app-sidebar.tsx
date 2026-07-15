"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  GitBranchIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  SettingsIcon,
  ChevronRightIcon,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NavUser } from "@/components/DashboardLayout/nav-user";

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Repositories", href: "/repos", icon: GitBranchIcon },
  { title: "Reviews", href: "/reviews", icon: MessageSquareIcon },
  { title: "Logs", href: "/logs", icon: ScrollTextIcon },
  {
    title: "Settings",
    href: "/settings",
    icon: SettingsIcon,
    children: [
      { title: "API Keys", href: "/settings/api-keys" },
      { title: "Repository Memory", href: "/settings/repo-memory" },
      { title: "Connections", href: "/settings/connections" },
    ],
  },
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        navItems
          .filter((item) => item.children)
          .map((item) => [item.href, pathname.startsWith(item.href)])
      )
  );

  // A Link navigation doesn't remount this component, so if a settings
  // sub-page is reached from elsewhere (not via the sidebar toggle), make
  // sure its section is expanded. Adjusted during render (React's sanctioned
  // pattern for state that must track a prop) rather than an effect, so it
  // takes effect on the same render as the pathname change. Only forces
  // open, never closed, so a manual collapse while already inside the
  // section still sticks.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    const toForceOpen = navItems.filter(
      (item) => item.children && pathname.startsWith(item.href) && !openSections[item.href]
    );
    if (toForceOpen.length > 0) {
      setOpenSections((prev) => {
        const next = { ...prev };
        for (const item of toForceOpen) next[item.href] = true;
        return next;
      });
    }
  }

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
                if (!item.children) {
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
                }

                const isSectionActive = pathname.startsWith(item.href);
                return (
                  <Collapsible
                    key={item.href}
                    open={openSections[item.href] ?? false}
                    onOpenChange={(open) =>
                      setOpenSections((prev) => ({ ...prev, [item.href]: open }))
                    }
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={isSectionActive}
                        tooltip={item.title}
                        className="group h-10 gap-3 rounded-[10px] px-3.5 text-[14.5px] data-active:border-l-2 data-active:border-l-kc-amber data-active:font-semibold"
                        render={<CollapsibleTrigger />}
                      >
                        <item.icon className="size-[18px]" />
                        <span>{item.title}</span>
                        <ChevronRightIcon className="ml-auto size-4 shrink-0 text-(--kc-text-dim) transition-transform group-data-panel-open:rotate-90" />
                      </SidebarMenuButton>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((sub) => (
                            <SidebarMenuSubItem key={sub.href}>
                              <SidebarMenuSubButton
                                isActive={pathname === sub.href}
                                render={
                                  <Link
                                    href={sub.href}
                                    onClick={() => setOpenMobile(false)}
                                  />
                                }
                              >
                                <span>{sub.title}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
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
