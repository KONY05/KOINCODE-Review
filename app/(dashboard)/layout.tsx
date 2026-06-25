import { redirect } from "next/navigation";

import { getAuthUser } from "@/lib/actions/auth";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/DashboardLayout/app-sidebar";
import { DashboardHeader } from "@/components/DashboardLayout/dashboard-header";
import { AnalyticsProvider } from "@/components/providers/analytics-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dbUser = await getAuthUser();
  if (!dbUser) redirect("/");

  if (!dbUser.hasCompletedOnboarding) {
    redirect("/onboarding");
  }

  const sidebarUser = {
    name: dbUser.name,
    email: dbUser.email,
    avatarUrl: dbUser.avatarUrl,
    githubUsername: dbUser.githubUsername,
  };

  return (
    <AnalyticsProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar user={sidebarUser} />
          <SidebarInset>
            <DashboardHeader />
            <div className="flex-1 overflow-auto px-6 py-8 md:px-11 md:py-10">
              <div className="mx-auto max-w-[1180px]">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </AnalyticsProvider>
  );
}
