"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { KeyIcon, LockIcon, ZapIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { completeOnboarding } from "@/lib/actions/onboarding";
import { PROVIDERS } from "@/config/providers";
import type { LlmProvider } from "@/lib/db/schema/api-keys";
import Logo from "../Logo";

const providerIds = PROVIDERS.map((p) => p.id) as [LlmProvider, ...LlmProvider[]];
const allModels = PROVIDERS.flatMap((p) => p.models);

const onboardingSchema = z.object({
  provider: z.enum(providerIds),
  model: z.enum(allModels as [string, ...string[]]),
  apiKey: z.string().min(5, "API key is too short"),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

export function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { isValid },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
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

  function onSubmit(data: OnboardingValues) {
    startTransition(async () => {
      const result = await completeOnboarding(data);
      if (result.success) {
        router.push("/dashboard");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await completeOnboarding(null);
      if (result.success) {
        router.push("/dashboard");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="w-full max-w-[560px] animate-[kc-pop_0.4s_ease_both]">
      {/* Header */}
      <div className="mb-8 text-center">
        <Logo />
        <h2 className="mt-5 text-[25px] font-bold tracking-[-0.01em]">
          Choose your model
        </h2>
        <p className="mt-1.5 text-[14.5px] text-(--kc-text-secondary)">
          Bring your own API key. A model is required to activate reviews.
        </p>
      </div>

      {/* Form card */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-[20px] border border-(--kc-border) bg-card p-6"
      >
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
        <div className="flex flex-col gap-2">
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

        {/* Activate */}
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
          {isPending ? "Activating..." : "Activate Code Reviews"}
        </button>

        {/* Skip */}
        <button
          type="button"
          onClick={handleSkip}
          disabled={isPending}
          className="mt-2.5 w-full cursor-pointer bg-transparent py-2 text-center text-[13px] text-(--kc-text-muted) transition-colors hover:text-(--kc-text-secondary)"
        >
          Skip for now
        </button>
      </form>
    </div>
  );
}
