import type { Metadata } from "next";

import {
  fetchLogs,
  fetchLogsSummary,
  fetchUserRepoOptions,
} from "@/lib/actions/logs";
import { LogsPageClient } from "../../../components/Logs/LogsPageClient";

export const metadata: Metadata = { title: "Usage Logs" };

export default async function LogsPage() {
  const defaultFilter = { days: 30 };

  const [logsResult, summaryResult, repoResult] = await Promise.all([
    fetchLogs(defaultFilter),
    fetchLogsSummary(defaultFilter),
    fetchUserRepoOptions(),
  ]);

  const { logs, pageCount } = logsResult.success
    ? logsResult.data
    : { logs: [], pageCount: 0 };

  const summary = summaryResult.success
    ? summaryResult.data
    : { totalCalls: 0, totalTokens: 0, successRate: 0, avgDurationMs: 0 };

  const repoOptions = repoResult.success ? repoResult.data : [];

  return (
    <div className="animate-[kc-fade_0.35s_ease_both]">
      <h1 className="text-[34px] font-bold tracking-[-0.02em]">Usage Logs</h1>
      <p className="mt-1.5 text-[15px] text-(--kc-text-secondary)">
        Track API calls made with your keys — tokens, latency, and errors
      </p>

      <LogsPageClient
        initialLogs={logs}
        initialPageCount={pageCount}
        initialSummary={summary}
        repoOptions={repoOptions}
      />
    </div>
  );
}
