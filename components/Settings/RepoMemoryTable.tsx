"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getRepoMemories,
  toggleMemoryActive,
  deleteMemory,
  type MemoryRow,
} from "@/lib/actions/repo-memories";
import { getMemoryColumns } from "./columns";

const headClass =
  "px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)";
const cellClass = "px-5 py-4";

export function RepoMemoryTable({
  initialMemories,
  initialPageCount,
  initialTotalCount,
}: {
  initialMemories: MemoryRow[];
  initialPageCount: number;
  initialTotalCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState(initialMemories);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [pageIndex, setPageIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<MemoryRow | null>(null);

  function refreshPage(page: number) {
    startTransition(async () => {
      const result = await getRepoMemories(page);
      if (result.success) {
        setData(result.data.memories);
        setPageCount(result.data.pageCount);
        setTotalCount(result.data.totalCount);
      }
    });
  }

  function handleToggle(memoryId: string) {
    startTransition(async () => {
      const result = await toggleMemoryActive(memoryId);
      if (result.success) {
        refreshPage(pageIndex);
      } else {
        toast.error(result.error);
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteMemory(deleteTarget.id);
      setDeleteTarget(null);
      if (result.success) {
        toast.success("Memory deleted.");
        const newTotal = totalCount - 1;
        const newPageCount = Math.max(Math.ceil(newTotal / 25), 1);
        const safePage = Math.min(pageIndex, newPageCount - 1);
        setPageIndex(safePage);
        refreshPage(safePage);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns = getMemoryColumns({
    onToggle: handleToggle,
    onDeleteRequest: (id: string) => {
      const memory = data.find((m) => m.id === id);
      if (memory) setDeleteTarget(memory);
    },
    isPending,
  });

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
      setPageIndex(next.pageIndex);
      refreshPage(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  return (
    <>
      <div className="mt-5 mb-4">
        <span className="text-[13px] text-(--kc-text-muted)">
          {totalCount} {totalCount === 1 ? "rule" : "rules"} across your repos
        </span>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-(--kc-border-subtle)">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-(--kc-border-subtle) bg-(--kc-bg) hover:bg-(--kc-bg)"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.column.id === "rule"
                        ? `${headClass} min-w-[280px]`
                        : header.column.id === "actions"
                          ? "w-[50px] px-5 py-3.5"
                          : headClass
                    }
                  >
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
                  className="h-24 text-center text-[13px] text-(--kc-text-dim)"
                >
                  {isPending ? "Loading…" : "No memories on this page"}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-(--kc-border-subtle) last:border-0 hover:bg-(--kc-bg-alt)/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cellClass}>
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
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memory from {deleteTarget?.repoFullName ?? "repo"}</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the rule: &ldquo;<strong>{deleteTarget?.rule}</strong>&rdquo;. The review agent will no longer apply it to future reviews.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
