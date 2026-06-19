import { currentUser } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";

export async function getGithubToken(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;

  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(
    user.id,
    "github"
  );

  return response.data[0]?.token ?? null;
}
