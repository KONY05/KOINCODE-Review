"use server";

import { eq, and, desc } from "drizzle-orm";

import { getAuthUser } from "@/lib/actions/auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { db } from "@/lib/db";
import { cliTokens } from "@/lib/db/schema";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";

export type CliConnectionRow = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function getCliConnections(): Promise<
  ActionResult<CliConnectionRow[]>
> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    const rows = await db
      .select({
        id: cliTokens.id,
        name: cliTokens.name,
        createdAt: cliTokens.createdAt,
        lastUsedAt: cliTokens.lastUsedAt,
      })
      .from(cliTokens)
      .where(eq(cliTokens.userId, dbUser.id))
      .orderBy(desc(cliTokens.createdAt));

    return ok(
      rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      }))
    );
  } catch (e) {
    return fail("Failed to fetch CLI connections", e);
  }
}

export async function revokeCliConnection(
  tokenId: string
): Promise<ActionResult> {
  try {
    const dbUser = await getAuthUser();
    if (!dbUser) return fail("Unauthorized");

    await db
      .delete(cliTokens)
      .where(and(eq(cliTokens.id, tokenId), eq(cliTokens.userId, dbUser.id)));

    await trackServer(EVENTS.CLI_TOKEN_REVOKED, dbUser.id);

    return ok(null);
  } catch (e) {
    return fail("Failed to revoke CLI connection", e);
  }
}
