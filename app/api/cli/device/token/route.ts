import { NextRequest, NextResponse } from "next/server";

import { pollAndExchangeDeviceAuth } from "@/lib/cli/device-auth";
import { deviceTokenPollSchema } from "@/lib/cli/schemas";

export async function POST(req: NextRequest) {
  const parsed = deviceTokenPollSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "deviceCode is required" }, { status: 400 });
  }

  const result = await pollAndExchangeDeviceAuth(parsed.data.deviceCode);

  if (result.status === "approved") {
    return NextResponse.json({
      status: "approved",
      token: result.token,
      userId: result.userId,
    });
  }

  return NextResponse.json({ status: result.status });
}
