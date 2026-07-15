import { TerminalIcon } from "lucide-react";

import type { CliConnectionRow } from "@/lib/actions/cli-connections";
import { ConnectionsTable } from "./ConnectionsTable";

export default function ConnectionsSection({
  connections,
}: {
  connections: CliConnectionRow[];
}) {
  return (
    <div className="mt-8 rounded-2xl border border-(--kc-border-subtle) bg-card p-7">
      <h3 className="flex items-center gap-2.5 text-[18px] font-semibold">
        <TerminalIcon className="size-[18px] text-kc-amber" />
        Connections
      </h3>
      <p className="mt-1.5 text-[13.5px] text-(--kc-text-secondary)">
        Everywhere your KOINCODE Review account is connected — revoke any device
        you don&apos;t recognize.
      </p>

      {connections.length > 0 ? (
        <ConnectionsTable connections={connections} />
      ) : (
        <p className="mt-5 text-center text-[13px] text-(--kc-text-dim)">
          No connections yet. Run <code>/review-login</code> from the CLI to
          connect a device.
        </p>
      )}
    </div>
  );
}
