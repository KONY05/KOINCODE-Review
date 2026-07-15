import type { Metadata } from "next";

import APIKeySection from "@/components/Settings/api-key/APIKeySection";
import { getApiKeys } from "@/lib/actions/api-keys";

export const metadata: Metadata = { title: "API Keys" };

export default async function ApiKeysSettingsPage() {
  const keysResult = await getApiKeys();
  const keys = keysResult.success ? keysResult.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">API Keys</h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Manage the models that power your code reviews
      </p>

      <APIKeySection keys={keys} />
    </div>
  );
}
