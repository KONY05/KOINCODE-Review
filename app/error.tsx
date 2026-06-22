"use client";

import Logo from "@/components/Logo";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-(--kc-bg)">
      <Logo />

      <p className="font-mono text-[80px] font-bold tracking-tight text-destructive mt-10 leading-none">
        500
      </p>
      <h1 className="text-xl font-semibold mt-4">Something went wrong</h1>
      <p className="text-(--kc-text-secondary) text-sm mt-2 text-center max-w-[380px]">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-(--kc-text-faint) mt-3">
          Error ID: {error.digest}
        </p>
      )}

      <button
        onClick={() => unstable_retry()}
        className="mt-8 inline-flex h-10 items-center rounded-md bg-(--kc-cream) px-6 text-sm font-medium text-(--kc-cream-text) hover:bg-(--kc-cream-hover) transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
