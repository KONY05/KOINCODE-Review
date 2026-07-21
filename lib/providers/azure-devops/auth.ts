import { clerkClient } from "@clerk/nextjs/server";

/**
 * Implements GitProvider's getTokenForClerkUser. Azure DevOps has no
 * distinct Clerk strategy — it reuses the "microsoft" social connection
 * (Entra ID), with Azure DevOps API access granted as an extra
 * fully-qualified scope on that same Microsoft OAuth app (see the Feature
 * 19 spec's Auth section).
 */
export async function getTokenForClerkUser(
  clerkId: string,
): Promise<string | null> {
  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(
    clerkId,
    "microsoft",
  );

  return response.data[0]?.token ?? null;
}
