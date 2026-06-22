"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Trash2Icon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { Switch } from "@/components/ui/switch";
import type { MemoryRow } from "@/lib/actions/repo-memories";
import { formatDate } from "@/lib/utils";

const columnHelper = createColumnHelper<MemoryRow>();

type ColumnActions = {
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
};

export function getMemoryColumns({ onToggle, onDelete, isPending }: ColumnActions) {
  return [
    columnHelper.accessor("repoFullName", {
      header: "Repository",
      cell: (info) => (
        <span className="text-[13px] font-medium">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("rule", {
      header: "Rule",
      cell: (info) => (
        <p className="max-w-[400px] text-[13px] text-(--kc-text-secondary) leading-normal">
          {info.getValue()}
        </p>
      ),
    }),
    columnHelper.accessor("sourceUrl", {
      header: "Source",
      cell: (info) => {
        const url = info.getValue();
        if (url === "manual") {
          return (
            <span className="rounded-full border border-(--kc-border) px-2.5 py-0.5 text-[11px] font-medium text-(--kc-text-muted)">
              Manual
            </span>
          );
        }
        return (
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-(--kc-border) px-2.5 py-0.5 text-[11px] font-medium text-(--kc-text-muted) transition-colors hover:border-(--kc-text-dim) hover:text-(--kc-text)"
          >
            GitHub
            <ExternalLinkIcon className="size-[10px]" />
          </Link>
        );
      },
    }),
    columnHelper.accessor("isActive", {
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <Switch
            checked={row.original.isActive}
            onCheckedChange={() => onToggle(row.original.id)}
            disabled={isPending}
          />
          <span
            className={`text-[12.5px] font-medium ${
              row.original.isActive
                ? "text-emerald-500"
                : "text-(--kc-text-dim)"
            }`}
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor("createdAt", {
      header: "Created",
      cell: (info) => (
        <span className="text-[13px] text-(--kc-text-muted)">
          {formatDate(info.getValue())}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onDelete(row.original.id)}
          disabled={isPending}
          className="cursor-pointer rounded-lg p-1.5 text-(--kc-text-dim) transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2Icon className="size-[15px]" />
        </button>
      ),
    }),
  ];
}
