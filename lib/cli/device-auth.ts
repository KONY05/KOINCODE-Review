import { randomBytes, createHash } from "node:crypto";
import { eq, lt, and } from "drizzle-orm";

import { db } from "@/lib/db";
import { cliTokens, pendingDeviceAuth } from "@/lib/db/schema";

const DEVICE_CODE_TTL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_SECONDS = 3;

function generateCode(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

// sha256 is sufficient here — these are high-entropy generated tokens, not
// user-chosen passwords, so a slow KDF (bcrypt/argon2) buys nothing.
export function hashCliToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type CreateDeviceAuthResult = {
  deviceCode: string;
  expiresIn: number;
  interval: number;
};

export async function createPendingDeviceAuth(): Promise<CreateDeviceAuthResult> {
  const deviceCode = generateCode(32);
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);

  await db.insert(pendingDeviceAuth).values({ deviceCode, expiresAt });

  // Opportunistic cleanup, piggybacked on this write — the table is small and
  // short-lived enough (~5 min TTL) that a dedicated cron would be overkill.
  await db
    .delete(pendingDeviceAuth)
    .where(lt(pendingDeviceAuth.expiresAt, new Date()));

  return {
    deviceCode,
    expiresIn: DEVICE_CODE_TTL_MS / 1000,
    interval: POLL_INTERVAL_SECONDS,
  };
}

/** Called from the /cli-auth page's Allow action. Returns false if the code is unknown or expired. */
export async function approveDeviceAuth(
  deviceCode: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(pendingDeviceAuth)
    .where(eq(pendingDeviceAuth.deviceCode, deviceCode))
    .limit(1);

  if (!row || row.expiresAt < new Date()) return false;

  await db
    .update(pendingDeviceAuth)
    .set({ status: "approved", userId })
    .where(eq(pendingDeviceAuth.deviceCode, deviceCode));

  return true;
}

/** Called from the /cli-auth page's Deny action. */
export async function denyDeviceAuth(deviceCode: string): Promise<void> {
  await db
    .update(pendingDeviceAuth)
    .set({ status: "denied" })
    .where(eq(pendingDeviceAuth.deviceCode, deviceCode));
}

export type PollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "approved"; token: string; userId: string };

/**
 * Called by the CLI's poll loop. Mints and returns the raw CLI token exactly
 * once, on the poll that observes `status: "approved"` — a plain read-then-
 * insert-then-delete would let two concurrent polls (a retried/duplicate
 * request, or the CLI double-firing) both observe "approved" before either
 * deletes the row, each minting its own token for the same approval. The
 * claim below is a single atomic DELETE...RETURNING guarded on the row still
 * being "approved", so only one concurrent caller can ever win it.
 */
export async function pollAndExchangeDeviceAuth(
  deviceCode: string,
): Promise<PollResult> {
  const [row] = await db
    .select()
    .from(pendingDeviceAuth)
    .where(eq(pendingDeviceAuth.deviceCode, deviceCode))
    .limit(1);

  if (!row) return { status: "expired" };

  if (row.expiresAt < new Date()) {
    await db.delete(pendingDeviceAuth).where(eq(pendingDeviceAuth.id, row.id));
    return { status: "expired" };
  }

  if (row.status === "pending") {
    return { status: "pending" };
  }

  if (row.status === "denied" || !row.userId) {
    await db.delete(pendingDeviceAuth).where(eq(pendingDeviceAuth.id, row.id));
    return { status: "denied" };
  }

  // row.status === "approved" here. The claim (delete-and-return, conditioned
  // on the row still being "approved") and the token mint are two separate
  // write statements against two different tables, so they're wrapped in a
  // transaction: without it, a failed insert after a successful delete would
  // silently lose the approval with no token ever issued, and — since the
  // row would already be gone — no way to retry. The status guard on the
  // delete still prevents two concurrent polls from both winning the claim;
  // the transaction on top of that ensures the claim and the mint either
  // both land or neither does.
  const result = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .delete(pendingDeviceAuth)
      .where(
        and(
          eq(pendingDeviceAuth.id, row.id),
          eq(pendingDeviceAuth.status, "approved"),
        ),
      )
      .returning();

    if (!claimed?.userId) return null;

    const token = `kc_live_${generateCode(32)}`;
    await tx.insert(cliTokens).values({
      userId: claimed.userId,
      tokenHash: hashCliToken(token),
    });

    return { token, userId: claimed.userId };
  });

  if (!result) {
    // Lost the race to a concurrent poll that claimed it first (or,
    // defensively, the row came back with no userId) — already exchanged.
    return { status: "expired" };
  }

  return { status: "approved", token: result.token, userId: result.userId };
}
