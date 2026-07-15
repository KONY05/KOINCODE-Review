import type { Metadata } from "next";

import ConnectionsSection from "@/components/Settings/connections/ConnectionsSection";
import { getCliConnections } from "@/lib/actions/cli-connections";

export const metadata: Metadata = { title: "Connections" };

export default async function ConnectionsSettingsPage() {
  const connectionsResult = await getCliConnections();
  const connections = connectionsResult.success ? connectionsResult.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">
        Connections
      </h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Everywhere KOINCODE Review is connected to your workflow
      </p>

      <ConnectionsSection connections={connections} />
    </div>
  );
}
