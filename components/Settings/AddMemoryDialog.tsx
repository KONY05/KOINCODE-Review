"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addMemory } from "@/lib/actions/repo-memories";

type RepoOption = { id: string; fullName: string };

const addMemorySchema = z.object({
  repoId: z.string().min(1, "Select a repository"),
  rule: z
    .string()
    .min(3, "Rule is too short")
    .max(280, "Rule cannot exceed 280 characters"),
});

type AddMemoryValues = z.infer<typeof addMemorySchema>;

export function AddMemoryDialog({
  open,
  onOpenChange,
  repoOptions,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoOptions: RepoOption[];
  onAdded: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<AddMemoryValues>({
    resolver: zodResolver(addMemorySchema),
    mode: "onChange",
    defaultValues: { repoId: "", rule: "" },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const rule = watch("rule");

  function onSubmit(data: AddMemoryValues) {
    startTransition(async () => {
      const result = await addMemory(data.repoId, data.rule);
      if (result.success) {
        reset();
        onAdded();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add a Rule</DialogTitle>
          <DialogDescription>
            Teach the reviewer a convention. Max 280 characters, 50 rules per
            repo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-(--kc-text-secondary)">
              Repository
            </label>
            <Select
              value={watch("repoId")}
              onValueChange={(v) => {
                if (v) setValue("repoId", v, { shouldValidate: true });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a repo…" />
              </SelectTrigger>
              <SelectContent>
                {repoOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-(--kc-text-secondary)">
              Rule
            </label>
            <Textarea
              {...register("rule")}
              placeholder="e.g. Always use named exports, never default exports"
              rows={3}
              maxLength={280}
              className="resize-none text-[13.5px]"
            />
            <span className="mt-1 block text-right text-[11px] text-(--kc-text-dim)">
              {rule.length}/280
            </span>
          </div>

          <button
            type="submit"
            disabled={!isValid || isPending}
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold transition-colors ${
              isValid
                ? "bg-(--kc-cream) text-(--kc-cream-text) hover:bg-(--kc-cream-hover)"
                : "disabled:cursor-not-allowed bg-(--kc-surface) text-(--kc-text-dim)"
            }`}
          >
            {isPending ? "Adding…" : "Add Rule"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
