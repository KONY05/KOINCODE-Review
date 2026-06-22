"use client";

import Logo from "@/components/Logo";
import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh flex flex-col items-center justify-center px-6 bg-[#0a0c10] text-[#e6e8eb]">
        <Logo />

        <p className="font-mono text-[80px] font-bold tracking-tight text-[#f87171] mt-10 leading-none">
          500
        </p>
        <h1 className="text-xl font-semibold mt-4">Something went wrong</h1>
        <p className="text-[#878e98] text-sm mt-2 text-center max-w-[380px]">
          A critical error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-[#5d646e] mt-3">
            Error ID: {error.digest}
          </p>
        )}

        <button
          onClick={() => unstable_retry()}
          className="mt-8 inline-flex h-10 items-center rounded-md bg-[#f3dcc4] px-6 text-sm font-medium text-[#11141a] hover:bg-[#f7e6d4] transition-colors cursor-pointer"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
