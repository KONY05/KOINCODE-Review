import { clerkClient } from "@clerk/nextjs/server";

/** Implements GitProvider's getTokenForClerkUser. */
export async function getTokenForClerkUser(
  clerkId: string,
): Promise<string | null> {
  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(
    clerkId,
    "github"
  );

  return response.data[0]?.token ?? null;
}
