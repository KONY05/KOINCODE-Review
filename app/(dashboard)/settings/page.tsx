import { BotIcon } from "lucide-react";

import APIKeySection from "@/components/Settings/APIKeySection";
import { getApiKeys } from "@/lib/actions/api-keys";

export default async function SettingsPage() {
  const result = await getApiKeys();
  const keys = result.success ? result.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">Settings</h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Manage the models that power your code reviews
      </p>

      {/* API Keys section */}
      <APIKeySection keys={keys} />

      {/* Repository Memory concept */}
      <div className="mt-6 flex items-start gap-4 rounded-2xl border border-dashed border-(--kc-border) bg-(--kc-bg-alt) p-6">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] border border-kc-amber/25 bg-kc-amber/10">
          <BotIcon className="size-[19px] text-kc-amber" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[16px] font-semibold">Repository Memory</h3>
            <span className="rounded-full border border-kc-amber/35 px-2.5 py-0.5 font-mono text-[10.5px] text-kc-amber">
              CONCEPT
            </span>
          </div>
          <p className="mt-2 max-w-[680px] text-[13.5px] text-(--kc-text-secondary)">
            Give the reviewer per-repo memory — conventions, naming rules, and
            patterns it should always check. Optional idea pending your call.
          </p>
        </div>
        <button className="shrink-0 rounded-lg border border-(--kc-border) px-3.5 py-2 text-[12.5px] font-semibold text-(--kc-text-muted) transition-colors hover:border-(--kc-text-dim) hover:text-(--kc-text)">
          Learn more
        </button>
      </div>
    </div>
  );
}
