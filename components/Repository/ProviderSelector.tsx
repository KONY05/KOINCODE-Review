"use client";

import type { GitProviderId } from "@/lib/providers/types";
import { PROVIDER_CLERK_CONFIG } from "@/lib/providers/clerk-mapping";

type ProviderSelectorProps = {
  providers: GitProviderId[];
  activeProvider: GitProviderId;
  onProviderChange: (provider: GitProviderId) => void;
};

/** Only rendered when a user has linked more than one git provider — a single-provider account (the common case today) never sees this. */
export default function ProviderSelector({
  providers,
  activeProvider,
  onProviderChange,
}: ProviderSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-(--kc-border) bg-card p-1 w-fit">
      {providers.map((provider) => {
        const isActive = provider === activeProvider;
        return (
          <button
            key={provider}
            onClick={() => onProviderChange(provider)}
            className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-medium transition-colors cursor-pointer ${
              isActive
                ? "bg-[rgba(245,166,35,0.1)] text-kc-amber"
                : "text-(--kc-text-muted) hover:text-foreground"
            }`}
          >
            {PROVIDER_CLERK_CONFIG[provider].label}
          </button>
        );
      })}
    </div>
  );
}
