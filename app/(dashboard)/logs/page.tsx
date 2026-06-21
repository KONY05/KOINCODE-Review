import {
  fetchLogs,
  fetchLogsSummary,
  fetchUserRepoOptions,
} from "@/lib/actions/logs";
import { LogsPageClient } from "../../../components/Logs/LogsPageClient";

export default async function LogsPage() {
  const defaultFilter = { days: 30 };

  const [{ logs, pageCount }, summary, repoOptions] = await Promise.all([
    fetchLogs(defaultFilter),
    fetchLogsSummary(defaultFilter),
    fetchUserRepoOptions(),
  ]);

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
