import { currentUser } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";

export async function getGithubToken(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;

  return getTokenForClerkUser(user.id);
}

// Same lookup as getGithubToken(), but for callers with no Clerk session to
// read from (e.g. the CLI's bearer-token-authed routes, which already have a
// resolved Clerk user id from the DB user row). Implements GitProvider's
// getTokenForClerkUser.
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
