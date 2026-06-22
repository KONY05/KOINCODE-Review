"use client";

import { useTransition } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getProviderConfig } from "@/config/providers";
import {
  toggleApiKeyDefault,
  updateApiKeyModel,
  deleteApiKey,
} from "@/lib/actions/api-keys";
import type { ApiKeyRow } from "@/lib/actions/api-keys";

function providerLabel(provider: string) {
  return getProviderConfig(provider as ApiKeyRow["provider"])?.label ?? provider;
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function APIKeyTable({ keys }: { keys: ApiKeyRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle(keyId: string) {
    startTransition(async () => {
      const result = await toggleApiKeyDefault(keyId);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleModelChange(keyId: string, model: string) {
    startTransition(async () => {
      const result = await updateApiKeyModel(keyId, model);
      if (result.success) {
        router.refresh();
        toast.success("Model updated.");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(keyId: string) {
    startTransition(async () => {
      const result = await deleteApiKey(keyId);
      if (result.success) {
        router.refresh();
        toast.success("API key deleted.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-(--kc-border-subtle)">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-(--kc-border-subtle) bg-(--kc-bg) hover:bg-(--kc-bg)">
            <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
              Provider
            </TableHead>
            <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
              Encrypted Key
            </TableHead>
            <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
              Model
            </TableHead>
            <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
              Last Used
            </TableHead>
            <TableHead className="px-5 py-3.5 text-[12.5px] font-semibold tracking-wide text-(--kc-text-muted)">
              Status
            </TableHead>
            <TableHead className="w-[50px] px-5 py-3.5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => {
            const providerConfig = getProviderConfig(key.provider);
            const models = providerConfig?.models ?? [];

            return (
              <TableRow
                key={key.id}
                className="border-b border-(--kc-border-subtle) last:border-0 hover:bg-(--kc-bg-alt)/50"
              >
                {/* Provider */}
                <TableCell className="px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13.5px] font-semibold">
                      {providerLabel(key.provider)}
                    </span>
                    {providerConfig?.tag && (
                      <span className="rounded-full border border-(--kc-border) px-2 py-0.5 font-mono text-[10px] text-(--kc-text-muted)">
                        {providerConfig.tag}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Encrypted Key */}
                <TableCell className="px-5 py-4">
                  <span className="font-mono text-[13px] text-(--kc-text-secondary)">
                    {key.maskedKey}
                  </span>
                </TableCell>

                {/* Model Selector */}
                <TableCell className="px-5 py-4">
                  <Select
                    value={key.model}
                    onValueChange={(val) => {
                      if (val) handleModelChange(key.id, val);
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-8 w-fit min-w-[160px] border-none bg-(--kc-bg) font-mono text-[12.5px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Last Used */}
                <TableCell className="px-5 py-4">
                  <span className="text-[13px] text-(--kc-text-muted)">
                    {formatDate(key.lastUsedAt)}
                  </span>
                </TableCell>

                {/* Status Toggle */}
                <TableCell className="px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <Switch
                      checked={key.isDefault}
                      onCheckedChange={() => handleToggle(key.id)}
                      disabled={isPending}
                    />
                    <span
                      className={`text-[12.5px] font-medium ${
                        key.isDefault
                          ? "text-emerald-500"
                          : "text-(--kc-text-dim)"
                      }`}
                    >
                      {key.isDefault ? "Active" : "Inactive"}
                    </span>
                  </div>
                </TableCell>

                {/* Delete */}
                <TableCell className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => handleDelete(key.id)}
                    disabled={isPending}
                    className="rounded-lg p-1.5 text-(--kc-text-dim) transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Trash2Icon className="size-[15px]" />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
