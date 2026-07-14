import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import type { LlmProvider } from "@/lib/db/schema/api-keys";
import { encrypt } from "@/lib/crypto";

/** Not a "use server" file — takes an already-resolved userId as a plain
 * argument, must not become a client-callable Server Action. Same reasoning
 * as lib/repos/index.ts. */
export async function syncApiKeyForUser(
  userId: string,
  provider: LlmProvider,
  model: string,
  apiKey: string,
): Promise<void> {
  const [existingAny] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .limit(1);

  const isFirstKeyEver = !existingAny;

  await db
    .insert(apiKeys)
    .values({
      userId,
      provider,
      model,
      encryptedKey: encrypt(apiKey),
      isDefault: isFirstKeyEver,
    })
    .onConflictDoUpdate({
      target: [apiKeys.userId, apiKeys.provider],
      set: { model, encryptedKey: encrypt(apiKey) },
    });
}
