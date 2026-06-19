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

  return dbUser ?? null;
}
