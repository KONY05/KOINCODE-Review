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
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success("Secret copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
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

        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-(--kc-text-secondary)">
              Secret
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-(--kc-border) bg-muted/40 px-3 py-2">
              <code className="flex-1 truncate font-mono text-[12.5px]">{secret}</code>
              <button
                type="button"
                onClick={handleCopy}
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

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-(--kc-text-secondary)">
              Webhook URL
            </p>
            <code className="block truncate rounded-lg border border-(--kc-border) bg-muted/40 px-3 py-2 font-mono text-[12.5px]">
              {webhookUrl}
            </code>
          </div>

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
