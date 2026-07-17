import { Suspense } from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

import Logo from "@/components/Logo";
import { SignInTracker } from "./sign-in-tracker";

export default function SSOCallbackPage() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-(--kc-bg)">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <Logo/>
        <p className="text-sm text-(--kc-text-secondary)">
          Completing sign in…
        </p>
      </div>
      <Suspense fallback={null}>
        <SignInTracker />
      </Suspense>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
