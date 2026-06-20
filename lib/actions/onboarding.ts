"use server";

import { eq } from "drizzle-orm";

import { getAuthUser } from "@/lib/actions/auth";
import { db } from "@/lib/db";
import { apiKeys, users, LlmProvider } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";


type OnboardingData = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
};

export async function completeOnboarding(data: OnboardingData | null) {
  const dbUser = await getAuthUser();
  if (!dbUser) throw new Error("Unauthorized");

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
}
