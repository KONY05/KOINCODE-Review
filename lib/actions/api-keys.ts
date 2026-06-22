"use server";

import { eq, and, desc, not } from "drizzle-orm";

import { getAuthUser } from "@/lib/actions/auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { db } from "@/lib/db";
import { apiKeys, keyUsageLogs } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import type { LlmProvider } from "@/lib/db/schema/api-keys";

export type ApiKeyRow = {
  id: string;
  provider: LlmProvider;
  model: string;
  maskedKey: string;
  isDefault: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

function maskEncryptedKey(encrypted: string): string {
  const parts = encrypted.split(":");
  const ciphertext = parts[parts.length - 1];
  const last4 = ciphertext.slice(-4);
  return `••••••••${last4}`;
}

export async function getApiKeys(): Promise<ActionResult<ApiKeyRow[]>> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, dbUser.id))
      .orderBy(desc(apiKeys.createdAt));

    const rows: ApiKeyRow[] = [];

    for (const key of keys) {
      const [lastLog] = await db
        .select({ createdAt: keyUsageLogs.createdAt })
        .from(keyUsageLogs)
        .where(eq(keyUsageLogs.apiKeyId, key.id))
        .orderBy(desc(keyUsageLogs.createdAt))
        .limit(1);

      rows.push({
        id: key.id,
        provider: key.provider,
        model: key.model,
        maskedKey: maskEncryptedKey(key.encryptedKey),
        isDefault: key.isDefault,
        lastUsedAt: lastLog?.createdAt?.toISOString() ?? null,
        createdAt: key.createdAt.toISOString(),
      });
    }

    return ok(rows);
  } catch (e) {
    return fail("Failed to fetch API keys", e);
  }
}

export async function toggleApiKeyDefault(
  keyId: string
): Promise<ActionResult> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    await db.transaction(async (tx) => {
      const [key] = await tx
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, dbUser.id)))
        .limit(1);

      if (!key) throw new Error("API key not found");

      const newDefault = !key.isDefault;

      if (newDefault) {
        await tx
          .update(apiKeys)
          .set({ isDefault: false })
          .where(
            and(eq(apiKeys.userId, dbUser.id), not(eq(apiKeys.id, keyId)))
          );
      }

      await tx
        .update(apiKeys)
        .set({ isDefault: newDefault })
        .where(eq(apiKeys.id, keyId));
    });

    return ok(null);
  } catch (e) {
    return fail("Failed to toggle API key status", e);
  }
}

export async function updateApiKeyModel(
  keyId: string,
  model: string
): Promise<ActionResult> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, dbUser.id)))
      .limit(1);

    if (!key) return fail("API key not found");

    await db.update(apiKeys).set({ model }).where(eq(apiKeys.id, keyId));

    return ok(null);
  } catch (e) {
    return fail("Failed to update model", e);
  }
}

export async function deleteApiKey(keyId: string): Promise<ActionResult> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, dbUser.id)));

    return ok(null);
  } catch (e) {
    return fail("Failed to delete API key", e);
  }
}

export async function addApiKey(data: {
  provider: LlmProvider;
  model: string;
  apiKey: string;
}): Promise<ActionResult> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    const encryptedKey = encrypt(data.apiKey);

    const existingKeys = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, dbUser.id))
      .limit(1);

    await db.insert(apiKeys).values({
      userId: dbUser.id,
      provider: data.provider,
      model: data.model,
      encryptedKey,
      isDefault: existingKeys.length === 0,
    });

    return ok(null);
  } catch (e) {
    return fail("Failed to add API key", e);
  }
}
