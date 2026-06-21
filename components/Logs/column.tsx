"use client";

import { createColumnHelper } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LogEntry } from "@/lib/actions/logs";
import type { UsageAction } from "@/lib/db/schema/key-usage-logs";

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABELS: Record<UsageAction, string> = {
  review: "Review",
  embedding: "Embedding",
  memory_extraction: "Memory",
};

const ACTION_VARIANTS: Record<UsageAction, "default" | "secondary" | "outline"> = {
  review: "default",
  embedding: "secondary",
  memory_extraction: "outline",
};

const columnHelper = createColumnHelper<LogEntry>();

export const columns = [
  columnHelper.accessor("createdAt", {
    header: "Timestamp",
    cell: (info) => (
      <span className="whitespace-nowrap">
        {formatTimestamp(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("action", {
    header: "Action",
    cell: (info) => {
      const action = info.getValue();
      return (
        <Badge variant={ACTION_VARIANTS[action]}>
          {ACTION_LABELS[action]}
        </Badge>
      );
    },
  }),
  columnHelper.accessor("repoFullName", {
    header: "Repo",
    cell: (info) => (
      <span className="max-w-[180px] truncate block">
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  columnHelper.accessor("model", {
    header: "Model",
    cell: (info) => (
      <span className="font-mono text-[12px]">{info.getValue()}</span>
    ),
  }),
  columnHelper.display({
    id: "tokens",
    header: () => <span className="block text-right">Tokens</span>,
    cell: ({ row }) => {
      const { inputTokens, outputTokens } = row.original;
      const total = (inputTokens + outputTokens).toLocaleString();
      return (
        <div className="text-right">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="font-mono text-[13px] cursor-default" />
              }
            >
              {total}
            </TooltipTrigger>
            <TooltipContent>
              Input: {inputTokens.toLocaleString()} · Output:{" "}
              {outputTokens.toLocaleString()}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    },
  }),
  columnHelper.accessor("durationMs", {
    header: () => <span className="block text-right">Duration</span>,
    cell: (info) => (
      <span className="block text-right font-mono">
        {formatDuration(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: () => <span className="block text-center">Status</span>,
    cell: ({ row }) => {
      const { status, error } = row.original;
      return (
        <div className="text-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className={`inline-block size-2.5 rounded-full ${
                    status === "success" ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
              }
            />
            <TooltipContent>
              {status === "success" ? "Success" : error ?? "Failed"}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    },
  }),
];
