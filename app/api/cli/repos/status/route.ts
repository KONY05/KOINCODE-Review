import { NextRequest, NextResponse } from "next/server";

import { requireCliToken } from "@/lib/cli-auth";
import { repoRefSchema } from "@/lib/cli/schemas";
import { getRepoStatusForUser } from "@/lib/repos";

export async function GET(req: NextRequest) {
  const auth = await requireCliToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = repoRefSchema.safeParse({
    owner: req.nextUrl.searchParams.get("owner"),
    repo: req.nextUrl.searchParams.get("repo"),
    provider: req.nextUrl.searchParams.get("provider") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "owner and repo query params are required" },
      { status: 400 },
    );
  }
  const { owner, repo: repoName, provider } = parsed.data;

  const status = await getRepoStatusForUser(auth.userId, provider, owner, repoName);
  return NextResponse.json(status);
}
