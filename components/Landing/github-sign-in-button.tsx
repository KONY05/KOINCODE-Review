"use client";

import { useClerk } from "@clerk/nextjs";

import GitHubIcon from "@/components/icon/GithubIcon";

export function GitHubSignInButton() {
  const clerk = useClerk();

  const handleClick = async () => {
    if (!clerk.client) return;
    await clerk.client.signIn.authenticateWithRedirect({
      strategy: "oauth_github",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/dashboard",
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
