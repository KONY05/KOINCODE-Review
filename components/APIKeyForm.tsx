"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { KeyIcon, LockIcon, ZapIcon, CheckIcon } from "lucide-react";

import { PROVIDERS } from "@/config/providers";
import type { LlmProvider } from "@/lib/db/schema/api-keys";

const providerIds = PROVIDERS.map((p) => p.id) as [LlmProvider, ...LlmProvider[]];
const allModels = PROVIDERS.flatMap((p) => p.models);

const apiKeySchema = z.object({
  provider: z.enum(providerIds),
  model: z.enum(allModels as [string, ...string[]]),
  apiKey: z.string().min(5, "API key is too short"),
});

export type APIKeyFormValues = z.infer<typeof apiKeySchema>;

type APIKeyFormProps = {
  onSubmit: (data: APIKeyFormValues) => Promise<void>;
  submitLabel?: string;
  pendingLabel?: string;
};

export function APIKeyForm({
  onSubmit: onSubmitProp,
  submitLabel = "Activate Code Reviews",
  pendingLabel = "Activating...",
}: APIKeyFormProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { isValid },
  } = useForm<APIKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    mode: "onChange",
    defaultValues: {
      provider: "anthropic",
      model: PROVIDERS[0].models[0],
      apiKey: "",
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const provider = watch("provider");
  const model = watch("model");
  const currentProvider = PROVIDERS.find((p) => p.id === provider)!;

  function handleProviderSelect(id: LlmProvider) {
    setValue("provider", id, { shouldValidate: true });
    const prov = PROVIDERS.find((p) => p.id === id)!;
    setValue("model", prov.models[0], { shouldValidate: true });
  }

  function onSubmit(data: APIKeyFormValues) {
    startTransition(() => onSubmitProp(data));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Step 1 — Provider */}
      <div className="mb-3 font-mono text-[11px] tracking-[0.14em] text-(--kc-text-dim)">
        1 · PROVIDER
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {PROVIDERS.map((p) => {
          const selected = p.id === provider;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProviderSelect(p.id)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-3.5 text-center transition-colors ${
                selected
                  ? "border-kc-amber bg-kc-amber/8 text-white"
                  : "border-(--kc-border) bg-(--kc-bg) text-(--kc-text-muted) hover:border-(--kc-text-dim)"
              }`}
            >
              <span className="text-[13.5px] font-semibold">{p.label}</span>
              <span className="font-mono text-[10.5px] text-(--kc-text-muted)">
                {p.tag}
              </span>
            </button>
          );
        })}
      </div>

      {/* Step 2 — Model */}
      <div className="mb-3 mt-6 font-mono text-[11px] tracking-[0.14em] text-(--kc-text-dim)">
        2 · MODEL
      </div>
      <div className="flex max-h-[140px] md:max-h-[200px] flex-col gap-2 overflow-y-auto">
        {currentProvider.models.map((m) => {
          const selected = m === model;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setValue("model", m, { shouldValidate: true })}
              className={`flex cursor-pointer items-center justify-between rounded-[11px] border px-4 py-3.5 transition-colors ${
                selected
                  ? "border-kc-amber bg-kc-amber/6"
                  : "border-(--kc-border) bg-(--kc-bg) hover:border-(--kc-text-dim)"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    selected ? "bg-kc-amber" : "bg-(--kc-text-dim)"
                  }`}
                />
                <span className="font-mono text-[13.5px]">{m}</span>
              </span>
              {selected && <CheckIcon className="size-4 text-kc-amber" />}
            </button>
          );
        })}
      </div>

      {/* Step 3 — API Key */}
      <div className="mb-3 mt-6 font-mono text-[11px] tracking-[0.14em] text-(--kc-text-dim)">
        3 · API KEY
      </div>
      <div className="flex items-center gap-2.5 rounded-[11px] border border-(--kc-border) bg-(--kc-bg) px-4 py-3.5">
        <KeyIcon className="size-4 shrink-0 text-(--kc-text-dim)" />
        <input
          type="password"
          placeholder="sk-ant-•••••••••••••••••••"
          {...register("apiKey")}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13.5px] text-(--kc-text) outline-none placeholder:text-(--kc-text-dim)"
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 px-0.5 text-[12px] text-(--kc-text-dim)">
        <LockIcon className="size-[13px]" />
        Stored encrypted. Used only to request reviews on your behalf.
      </p>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid || isPending}
        className={`mt-6 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl px-4 py-4 text-[15px] font-semibold transition-colors ${
          isValid
            ? "bg-(--kc-cream) text-(--kc-cream-text) hover:bg-(--kc-cream-hover)"
            : "cursor-not-allowed disabled:cursor-not-allowed bg-(--kc-surface) text-(--kc-text-dim)"
        }`}
      >
        <ZapIcon className="size-[17px]" />
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
