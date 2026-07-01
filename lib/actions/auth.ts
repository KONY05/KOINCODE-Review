import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function getAuthUser() {
  let clerkUser;
  try {
    clerkUser = await currentUser();
  } catch {
    return null;
  }
  if (!clerkUser) return null;

  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkUser.id))
    .limit(1);

  if (dbUser) return dbUser;

  // Fallback for a missed `user.created` webhook delivery: create the row
  // here so a flaky/misconfigured webhook doesn't permanently strand a user.
  const email =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) return null;

  const githubAccount = clerkUser.externalAccounts.find(
    (a) => a.provider === "oauth_github" || a.provider === "github"
  );

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    githubAccount?.username ||
    null;

  const [createdUser] = await db
    .insert(users)
    .values({
      clerkId: clerkUser.id,
      email,
      name: fullName,
      avatarUrl: clerkUser.imageUrl,
      githubUsername: githubAccount?.username ?? null,
    })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();

  if (createdUser) return createdUser;

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkUser.id))
    .limit(1);

  return existing ?? null;
}
