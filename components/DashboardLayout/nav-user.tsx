"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOutIcon, ChevronsUpDownIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavUserProps {
  user: {
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

export function NavUser({ user }: NavUserProps) {
  const { signOut } = useClerk();
  const { isMobile } = useSidebar();

  const initials = (user.name ?? user.email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="h-auto gap-3 px-2 py-2"
              />
            }
          >
              <Avatar className="size-[34px] shrink-0">
                <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? ""} />
                <AvatarFallback className="bg-linear-to-br from-kc-amber to-[#e0533d] text-sm font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                <div className="truncate text-[13px] font-semibold">
                  {user.name ?? "User"}
                </div>
                <div className="truncate text-[11px] text-(--kc-text-muted)">
                  {user.email}
                </div>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4 text-(--kc-text-dim) group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem
              onClick={() => signOut({ redirectUrl: "/" })}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <LogOutIcon className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
