import type { Metadata } from "next";

import { getAuthUser } from "@/lib/actions/auth";
import { GitHubSignInButton } from "@/components/github-sign-in-button";
import { CliAuthApproval } from "@/components/CLI-Auth/approve-deny";

export const metadata: Metadata = { title: "Authorize KOINCODE CLI" };

type Props = {
  searchParams: Promise<{ device_code?: string }>;
};

export default async function CliAuthPage({ searchParams }: Props) {
  const { device_code: deviceCode } = await searchParams;

  if (!deviceCode) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-(--kc-bg) px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground max-w-sm">
          Missing device code. Run <code>/review-login</code> from the KOINCODE
          CLI to start again.
        </p>
      </div>
    );
  }

  const user = await getAuthUser();

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-(--kc-bg) px-6 py-10">
        <div className="w-full max-w-[380px]">
          <h1 className="text-[26px] font-bold tracking-[-0.01em] mb-2">
            Sign in to authorize the CLI
          </h1>
          <p className="text-(--kc-text-secondary) text-[14.5px] mb-7">
            Sign in with GitHub to link your KOINCODE CLI to this account.
          </p>
          <GitHubSignInButton
            redirectUrlComplete={`/cli-auth?device_code=${encodeURIComponent(deviceCode)}`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-(--kc-bg) px-6 py-10">
      <CliAuthApproval deviceCode={deviceCode} userEmail={user.email} />
    </div>
  );
}
