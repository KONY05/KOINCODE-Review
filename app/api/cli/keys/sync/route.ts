import { NextRequest, NextResponse } from "next/server";

import { requireCliToken } from "@/lib/cli-auth";
import { keySyncSchema } from "@/lib/cli/schemas";
import { syncApiKeyForUser } from "@/lib/cli/keys";
import { getProviderConfig } from "@/config/providers";
import { trackServer } from "@/lib/analytics/mixpanel-server";
import { EVENTS } from "@/lib/analytics/events";

export async function POST(req: NextRequest) {
  const auth = await requireCliToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = keySyncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "provider, model, and apiKey are required" },
      { status: 400 },
    );
  }

  const providerConfig = getProviderConfig(parsed.data.provider);
  if (!providerConfig || !providerConfig.models.includes(parsed.data.model)) {
    return NextResponse.json(
      { error: "Unsupported model for this provider" },
      { status: 400 },
    );
  }

  await syncApiKeyForUser(
    auth.userId,
    parsed.data.provider,
    parsed.data.model,
    parsed.data.apiKey,
  );

  await trackServer(EVENTS.API_KEY_ADDED, auth.userId, {
    provider: parsed.data.provider,
    source: "cli",
  });

  return NextResponse.json({ success: true });
}
