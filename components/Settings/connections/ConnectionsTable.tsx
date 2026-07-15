"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { revokeCliConnection } from "@/lib/actions/cli-connections";
import type { CliConnectionRow } from "@/lib/actions/cli-connections";
import { formatDate } from "@/lib/utils";

export function ConnectionsTable({
  connections,
}: {
  connections: CliConnectionRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [revokeTarget, setRevokeTarget] = useState<CliConnectionRow | null>(
    null
  );

  function confirmRevoke() {
    if (!revokeTarget) return;
    startTransition(async () => {
      const result = await revokeCliConnection(revokeTarget.id);
      setRevokeTarget(null);
      if (result.success) {
        router.refresh();
        toast.success("Connection revoked.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-[14px] border border-(--kc-border-subtle)">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-(--kc-border-subtle) bg-(--kc-bg) hover:bg-(--kc-bg)">
              <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
                Name
              </TableHead>
              <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
                Connected
              </TableHead>
              <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
                Last Used
              </TableHead>
              <TableHead className="w-[50px] px-5 py-3.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections.map((connection) => (
              <TableRow
                key={connection.id}
                className="border-b border-(--kc-border-subtle) last:border-0 hover:bg-(--kc-bg-alt)/50"
              >
                <TableCell className="px-5 py-4">
                  <span className="text-[13.5px] font-semibold">
                    {connection.name}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4">
                  <span className="text-[13px] text-(--kc-text-muted)">
                    {formatDate(connection.createdAt)}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4">
                  <span className="text-[13px] text-(--kc-text-muted)">
                    {formatDate(connection.lastUsedAt)}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(connection)}
                    disabled={isPending}
                    className="rounded-lg p-1.5 text-(--kc-text-dim) transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Trash2Icon className="size-[15px]" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &quot;{revokeTarget?.name}&quot;</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately disconnect it from your account. It will
              need to run <strong>/review-login</strong> again to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
