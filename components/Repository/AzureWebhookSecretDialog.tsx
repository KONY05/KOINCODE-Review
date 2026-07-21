"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AzureWebhookSecretDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: string;
  webhookUrl: string;
  repoName: string;
};

type CopyableFieldProps = {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
};

/** Shared by the Secret and Webhook URL rows below — both need the same truncate + copy-button + "Copied" feedback behavior, and the URL can be just as long as the secret (ngrok tunnel URLs in particular), so both need a copy affordance rather than relying on the truncated display. */
function CopyableField({ label, value, copied, onCopy }: CopyableFieldProps) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[12px] font-semibold text-(--kc-text-secondary)">{label}</p>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-(--kc-border) bg-muted/40 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-(--kc-border) px-2.5 py-1 text-[12px] font-medium cursor-pointer transition-colors hover:border-[rgba(245,166,35,0.5)]"
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-kc-green" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * Shown when connecting an Azure DevOps repo whose service hook couldn't be
 * auto-created (vso.hooks_write wasn't grantable — see the Feature 19 spec).
 * Not a toast: the secret has to stay on screen while the user goes and
 * pastes it into Azure DevOps's own UI, and closing this loses it (there's
 * no "show it again" — reconnecting the repo would generate a new one).
 */
export default function AzureWebhookSecretDialog({
  open,
  onOpenChange,
  secret,
  webhookUrl,
  repoName,
}: AzureWebhookSecretDialogProps) {
  const [copiedField, setCopiedField] = useState<"secret" | "url" | null>(null);

  async function handleCopy(field: "secret" | "url", value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success(`${label} copied to clipboard.`);
    setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finish connecting {repoName}</DialogTitle>
          <DialogDescription>
            Azure DevOps didn&apos;t allow us to create the service hook automatically for
            this repository. Copy the secret below, then set it up manually.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3">
          <CopyableField
            label="Secret"
            value={secret}
            copied={copiedField === "secret"}
            onCopy={() => handleCopy("secret", secret, "Secret")}
          />

          <CopyableField
            label="Webhook URL"
            value={webhookUrl}
            copied={copiedField === "url"}
            onCopy={() => handleCopy("url", webhookUrl, "Webhook URL")}
          />

          <ol className="mt-1 list-decimal space-y-1.5 pl-4 text-[13px] text-(--kc-text-secondary)">
            <li>
              In Azure DevOps, go to <strong>Project Settings → Service Hooks</strong>.
            </li>
            <li>
              Click <strong>+</strong> to create a new subscription, choose{" "}
              <strong>Web Hooks</strong>, then <strong>Next</strong>.
            </li>
            <li>Filter to this repository, then continue to the action step.</li>
            <li>
              Paste the webhook URL above, enable <strong>Basic authentication</strong>,
              set the username to <code className="font-mono">koincode</code>, and paste
              the secret above as the password.
            </li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
