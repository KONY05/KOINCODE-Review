"use client";

import { useClerk } from "@clerk/nextjs";

import GitHubIcon from "@/components/icon/GithubIcon";

type Props = {
  /** Where Clerk lands the user after OAuth completes. Defaults to the
   * dashboard; the /cli-auth page overrides this to loop back to itself
   * (with its device_code intact) instead of losing that context to /dashboard. */
  redirectUrlComplete?: string;
};

export function GitHubSignInButton({ redirectUrlComplete = "/dashboard" }: Props) {
  const clerk = useClerk();

  const handleClick = async () => {
    if (!clerk.client) return;
    await clerk.client.signIn.authenticateWithRedirect({
      strategy: "oauth_github",
      redirectUrl: "/sso-callback",
      redirectUrlComplete,
    });
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-3 bg-(--kc-cream) text-(--kc-cream-text) rounded-xl py-4 text-[15px] font-semibold cursor-pointer transition-colors hover:bg-(--kc-cream-hover)"
    >
      <GitHubIcon />
      Continue with GitHub
    </button>
  );
}
