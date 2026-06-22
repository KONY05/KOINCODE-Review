"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { completeOnboarding } from "@/lib/actions/onboarding";
import { APIKeyForm, type APIKeyFormValues } from "@/components/APIKeyForm";
import Logo from "../Logo";

export function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(data: APIKeyFormValues) {
    const result = await completeOnboarding(data);
    if (result.success) {
      router.push("/dashboard");
    } else {
      toast.error(result.error);
    }
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
      <div className="rounded-[20px] border border-(--kc-border) bg-card p-6">
        <APIKeyForm onSubmit={handleSubmit} />

        {/* Skip */}
        <button
          type="button"
          onClick={handleSkip}
          disabled={isPending}
          className="mt-2.5 w-full cursor-pointer bg-transparent py-2 text-center text-[13px] text-(--kc-text-muted) transition-colors hover:text-(--kc-text-secondary)"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
