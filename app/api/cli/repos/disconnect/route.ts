import { NextRequest, NextResponse } from "next/server";

import { requireCliToken } from "@/lib/cli-auth";
import { repoRefSchema } from "@/lib/cli/schemas";
import { githubProvider } from "@/lib/providers/github";
import { disconnectRepoForUser, findConnectedRepoExternalId } from "@/lib/repos";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";

export async function POST(req: NextRequest) {
  const auth = await requireCliToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = repoRefSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "owner and repo are required" },
      { status: 400 },
    );
  }
  const { owner, repo: repoName } = parsed.data;

  const externalId = await findConnectedRepoExternalId(
    auth.userId,
    owner,
    repoName,
  );
  if (externalId === null) {
    return NextResponse.json(
      { error: "Repository is not connected" },
      { status: 404 },
    );
  }

  // Best-effort — a missing/expired GitHub token shouldn't block disconnecting locally.
  const token = await githubProvider
    .getTokenForClerkUser(auth.clerkId)
    .catch(() => null);
  const repo = await disconnectRepoForUser(
    auth.userId,
    "github",
    externalId,
    token,
  );

  await trackServer(EVENTS.REPO_DISCONNECTED, auth.userId, {
    repo_name: repo ? `${repo.owner}/${repo.name}` : undefined,
    source: "cli",
  });

  return NextResponse.json({ success: true });
}
