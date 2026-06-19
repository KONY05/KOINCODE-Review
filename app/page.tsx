import { CheckIcon } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { GitHubSignInButton } from "@/components/Landing/github-sign-in-button";
import LockIcon from "@/components/icon/LockIcon";
import Logo from "@/components/Logo";


export default function LandingPage() {
  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      {/* Left — Hero */}
      <div className="relative flex flex-col gap-12 px-10 py-14 md:px-16 md:py-14 bg-(--kc-bg-alt)">
        <div className="absolute inset-0 bg-[radial-gradient(700px_460px_at_8%_20%,rgba(245,166,35,0.06),transparent_65%)] pointer-events-none" />

        <div className="relative flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>

        <div className="relative flex-1 flex flex-col justify-center">
          <h1 className="text-4xl md:text-[54px] leading-[1.04] font-bold tracking-[-0.03em]">
            Cut code review
            <br />
            time &amp; bugs in half.
            <br />
            <span className="text-kc-amber">Instantly.</span>
          </h1>
          <p className="text-(--kc-text-secondary) text-base max-w-[440px] mt-6 leading-relaxed">
            An AI agent reviews every pull request you open — flags bugs,
            suggests fixes, and commits them when you say go. Bring your own
            model.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-7 font-mono text-[12.5px] text-(--kc-text-muted)">
            <span className="flex items-center gap-2">
              <CheckIcon size={15} className="text-kc-green" />
              Any model
            </span>
            <span className="flex items-center gap-2">
              <CheckIcon size={15} className="text-kc-green" />
              Auto-fix &amp; commit
            </span>
            <span className="flex items-center gap-2">
              <CheckIcon size={15} className="text-kc-green" />
              Free, BYOK
            </span>
          </div>
        </div>

      </div>

      {/* Right — Login */}
      <div className="flex items-center justify-center p-10 bg-(--kc-bg)">
        <div className="w-full max-w-[380px] animate-[kc-pop_0.4s_ease_both]">
          <h2 className="text-[30px] font-bold tracking-[-0.01em]">
            Welcome back
          </h2>
          <p className="text-(--kc-text-secondary) mt-2 mb-7 text-[14.5px]">
            Login with your GitHub account to connect repositories.
          </p>

          <GitHubSignInButton />

          <div className="flex items-center gap-3.5 my-6">
            <div className="flex-1 h-px bg-(--kc-border)" />
            <span className="font-mono text-[11px] text-(--kc-text-faint)">
              SECURE OAUTH
            </span>
            <div className="flex-1 h-px bg-(--kc-border)" />
          </div>

          <p className="text-center text-(--kc-text-dim) text-[12.5px] leading-relaxed flex items-start justify-center gap-1.5">
            <LockIcon />
            <span>
              Stored encrypted. Used only to request reviews on your behalf. By
              continuing you agree to the Terms and Privacy Policy. We only
              request the repo scopes needed to post reviews.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
