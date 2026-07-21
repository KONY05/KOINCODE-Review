import { NextRequest, NextResponse } from "next/server";

import { requireCliToken } from "@/lib/cli-auth";
import { repoRefSchema } from "@/lib/cli/schemas";
import { getProvider } from "@/lib/providers/registry";
import { connectRepoForUser } from "@/lib/repos";
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
  const { owner, repo: repoName, provider } = parsed.data;
  const gitProvider = getProvider(provider);

  const token = await gitProvider.getTokenForClerkUser(auth.clerkId);
  if (!token) {
    return NextResponse.json(
      { error: `${provider} token not found` },
      { status: 400 },
    );
  }

  const remoteRepo = await gitProvider.fetchRepoByFullName(token, owner, repoName);
  if (!remoteRepo) {
    return NextResponse.json(
      { error: "Repository not found or not accessible" },
      { status: 404 },
    );
  }

  await connectRepoForUser(auth.userId, provider, remoteRepo, token);

  await trackServer(EVENTS.REPO_CONNECTED, auth.userId, {
    repo_name: remoteRepo.fullName,
    language: remoteRepo.language,
    source: "cli",
  });

  return NextResponse.json({
    success: true,
    provider,
    repo: {
      owner: remoteRepo.owner,
      name: remoteRepo.name,
      fullName: remoteRepo.fullName,
    },
  });
}
