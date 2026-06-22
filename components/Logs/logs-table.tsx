"use client";

import { useState, useTransition } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fetchLogs, type LogEntry, type LogsFilter } from "@/lib/actions/logs";
import { columns } from "./columns";

type RepoOption = { id: string; fullName: string };

export function LogsTable({
  initialLogs,
  initialPageCount,
  repoOptions,
  onFilterChange,
}: {
  initialLogs: LogEntry[];
  initialPageCount: number;
  repoOptions: RepoOption[];
  onFilterChange: (filter: LogsFilter) => void;
}) {
  const [data, setData] = useState(initialLogs);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [pageIndex, setPageIndex] = useState(0);
  const [filter, setFilter] = useState<LogsFilter>({ days: 30 });
  const [isPending, startTransition] = useTransition();

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: { pagination: { pageIndex, pageSize: 25 } },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize: 25 })
          : updater;
      goToPage(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  function goToPage(page: number) {
    setPageIndex(page);
    startTransition(async () => {
      const result = await fetchLogs(filter, page);
      if (result.success) {
        setData(result.data.logs);
        setPageCount(result.data.pageCount);
      }
    });
  }

  function updateFilter(key: keyof LogsFilter, value: string | null) {
    const next = { ...filter };
    const v = value ?? "all";
    if (key === "days") {
      next.days = Number(v);
    } else if (v === "all") {
      delete next[key];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = v;
    }
    setFilter(next);
    setPageIndex(0);
    startTransition(async () => {
      const result = await fetchLogs(next, 0);
      if (result.success) {
        setData(result.data.logs);
        setPageCount(result.data.pageCount);
      }
      onFilterChange(next);
    });
  }

  const headerCellClass = "text-[12px] font-medium text-(--kc-text-muted)";
  const bodyCellClass = "text-[13px] text-(--kc-text-secondary)";

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Select
          value={filter.action ?? "all"}
          onValueChange={(v) => updateFilter("action", v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="embedding">Embedding</SelectItem>
            <SelectItem value="memory_extraction">Memory</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.status ?? "all"}
          onValueChange={(v) => updateFilter("status", v)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {repoOptions.length > 0 && (
          <Select
            value={filter.repoId ?? "all"}
            onValueChange={(v) => updateFilter("repoId", v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Repository" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Repos</SelectItem>
              {repoOptions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={String(filter.days ?? 30)}
          onValueChange={(v) => updateFilter("days", v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-(--kc-border-subtle) overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={headerCellClass}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-[14px] text-(--kc-text-muted)"
                >
                  {isPending ? "Loading…" : "No logs found"}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={bodyCellClass}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[13px] text-(--kc-text-muted)">
            Page {pageIndex + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage() || isPending}
            >
              <ChevronsLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage() || isPending}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage() || isPending}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage() || isPending}
            >
              <ChevronsRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
