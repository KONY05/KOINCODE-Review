"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { APIKeyForm, type APIKeyFormValues } from "@/components/APIKeyForm";
import { addApiKey } from "@/lib/actions/api-keys";
import { useState } from "react";

export function AddKeyModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSubmit(data: APIKeyFormValues) {
    const result = await addApiKey(data);
    if (result.success) {
      toast.success("API key added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-(--kc-cream) px-4 py-2.5 text-[13.5px] font-semibold text-(--kc-cream-text) transition-colors hover:bg-(--kc-cream-hover)">
        <PlusIcon className="size-[15px]" />
        Add Key
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add API Key</DialogTitle>
          <DialogDescription>
            Choose a provider and model, then enter your API key.
          </DialogDescription>
        </DialogHeader>
        <APIKeyForm
          onSubmit={handleSubmit}
          submitLabel="Add Key"
          pendingLabel="Adding..."
        />
      </DialogContent>
    </Dialog>
  );
}
