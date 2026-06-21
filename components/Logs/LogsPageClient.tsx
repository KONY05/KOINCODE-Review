"use client";

import { useState, useTransition } from "react";
import {
  ActivityIcon,
  CoinsIcon,
  CheckCircleIcon,
  TimerIcon,
} from "lucide-react";

import { LogsTable } from "@/components/Logs/logs-table";
import {
  fetchLogsSummary,
  type LogEntry,
  type LogsFilter,
  type LogsSummary,
} from "@/lib/actions/logs";

type RepoOption = { id: string; fullName: string };

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const CARD_DEFS = [
  { key: "totalCalls", label: "Total Calls", icon: ActivityIcon },
  { key: "totalTokens", label: "Total Tokens", icon: CoinsIcon },
  { key: "successRate", label: "Success Rate", icon: CheckCircleIcon },
  { key: "avgDurationMs", label: "Avg Duration", icon: TimerIcon },
] as const;

function formatValue(key: string, value: number) {
  if (key === "successRate") return `${value}%`;
  if (key === "avgDurationMs") return formatDuration(value);
  return value.toLocaleString();
}

export function LogsPageClient({
  initialLogs,
  initialPageCount,
  initialSummary,
  repoOptions,
}: {
  initialLogs: LogEntry[];
  initialPageCount: number;
  initialSummary: LogsSummary;
  repoOptions: RepoOption[];
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [, startTransition] = useTransition();

  function handleFilterChange(filter: LogsFilter) {
    startTransition(async () => {
      const updated = await fetchLogsSummary(filter);
      setSummary(updated);
    });
  }

  return (
    <>
      <div className="mt-8 mb-8 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 xl:grid-cols-4">
        {CARD_DEFS.map((card) => (
          <div
            key={card.key}
            className="min-w-[200px] shrink-0 rounded-2xl border border-(--kc-border-subtle) bg-card p-5 sm:min-w-0 sm:shrink"
          >
            <div className="flex items-start justify-between">
              <span className="text-[13px] font-medium text-(--kc-text-muted)">
                {card.label}
              </span>
              <card.icon className="size-[17px] text-(--kc-text-dim)" />
            </div>
            <div className="mt-5 font-mono text-[30px] font-bold">
              {formatValue(card.key, summary[card.key])}
            </div>
          </div>
        ))}
      </div>

      <LogsTable
        initialLogs={initialLogs}
        initialPageCount={initialPageCount}
        repoOptions={repoOptions}
        onFilterChange={handleFilterChange}
      />
    </>
  );
}
