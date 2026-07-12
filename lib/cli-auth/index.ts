import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { cliTokens, users } from "@/lib/db/schema";
import { hashCliToken } from "@/lib/cli/device-auth";

export type CliAuthContext = {
  userId: string;
  clerkId: string;
};

/** Bearer-auth guard for the CLI-token-protected /api/cli/repos/* routes.
 * Joins straight to `users` since every caller needs at least `clerkId` (to
 * fetch a GitHub token) — saves each route its own follow-up query. */
export async function requireCliToken(
  req: Request,
): Promise<CliAuthContext | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const tokenHash = hashCliToken(token);

  const [row] = await db
    .select({
      id: cliTokens.id,
      userId: cliTokens.userId,
      clerkId: users.clerkId,
    })
    .from(cliTokens)
    .innerJoin(users, eq(users.id, cliTokens.userId))
    .where(eq(cliTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  await db
    .update(cliTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(cliTokens.id, row.id));

  return { userId: row.userId, clerkId: row.clerkId };
}
