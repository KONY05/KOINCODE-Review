import { NextRequest, NextResponse } from "next/server";

import { requireCliToken } from "@/lib/cli-auth";
import { repoRefSchema } from "@/lib/cli/schemas";
import { githubProvider } from "@/lib/providers/github";
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
  const { owner, repo: repoName } = parsed.data;

  const token = await githubProvider.getTokenForClerkUser(auth.clerkId);
  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not found" },
      { status: 400 },
    );
  }

  const ghRepo = await githubProvider.fetchRepoByFullName(token, owner, repoName);
  if (!ghRepo) {
    return NextResponse.json(
      { error: "Repository not found or not accessible" },
      { status: 404 },
    );
  }

  await connectRepoForUser(auth.userId, "github", ghRepo, token);

  await trackServer(EVENTS.REPO_CONNECTED, auth.userId, {
    repo_name: ghRepo.fullName,
    language: ghRepo.language,
    source: "cli",
  });

  return NextResponse.json({
    success: true,
    repo: { owner: ghRepo.owner, name: ghRepo.name, fullName: ghRepo.fullName },
  });
}
