import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Onboarding" };

import { getAuthUser } from "@/lib/actions/auth";
import { OnboardingForm } from "@/components/Onboarding/onboarding-form";

export default async function OnboardingPage() {
  const dbUser = await getAuthUser();
  if (!dbUser) redirect("/");

  if (dbUser.hasCompletedOnboarding) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(900px_500px_at_50%_-10%,rgba(245,166,35,0.07),transparent_70%),var(--kc-bg)] px-6 py-10">
      <OnboardingForm />
    </div>
  );
}
