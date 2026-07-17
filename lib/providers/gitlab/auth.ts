import { clerkClient } from "@clerk/nextjs/server";

/** Implements GitProvider's getTokenForClerkUser — requires the user to have linked GitLab as an additional Clerk connection (Settings > Connections). */
export async function getTokenForClerkUser(
  clerkId: string,
): Promise<string | null> {
  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(
    clerkId,
    "gitlab",
  );

  return response.data[0]?.token ?? null;
}
