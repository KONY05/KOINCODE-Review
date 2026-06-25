"use server";

import { eq } from "drizzle-orm";

import { getAuthUser } from "@/lib/actions/auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { db } from "@/lib/db";
import { apiKeys, users, LlmProvider } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";

type OnboardingData = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
};

export async function completeOnboarding(
  data: OnboardingData | null
): Promise<ActionResult> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    if (data) {
      const encryptedKey = encrypt(data.apiKey);

      await db.insert(apiKeys).values({
        userId: dbUser.id,
        provider: data.provider,
        model: data.model,
        encryptedKey,
        isDefault: true,
      });
    }

    await db
      .update(users)
      .set({ hasCompletedOnboarding: true })
      .where(eq(users.id, dbUser.id));

    if (data) {
      await trackServer(EVENTS.ONBOARDING_COMPLETED, dbUser.id, {
        provider: data.provider,
        model: data.model,
      });
    } else {
      await trackServer(EVENTS.ONBOARDING_SKIPPED, dbUser.id);
    }

    return ok(null);
  } catch (e) {
    return fail("Failed to complete onboarding", e);
  }
}
