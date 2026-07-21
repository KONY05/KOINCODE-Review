"use server";

import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/actions/auth";
import { findSignupUsername } from "@/lib/providers/clerk-mapping";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Called after completing an account-linking flow (Settings > Connections)
 * — backfills users.gitUsername if it's still null. Covers e.g. an account
 * that signed up via Azure DevOps (whose OAuth profile usually has no
 * "username" field at all, unlike GitHub/GitLab) and has just linked
 * GitHub/GitLab for the first time. No-op if a username is already stored —
 * gitUsername is otherwise never overwritten once set.
 */
export async function backfillGitUsernameIfMissing(): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("Unauthorized");
    if (user.gitUsername) return ok(null);

    const clerkUser = await currentUser();
    if (!clerkUser) return fail("Unauthorized");

    const username = findSignupUsername(clerkUser.externalAccounts);
    if (!username) return ok(null);

    await db.update(users).set({ gitUsername: username }).where(eq(users.id, user.id));
    
    return ok(null);
  } catch (e) {
    return fail("Failed to update username", e);
  }
}
