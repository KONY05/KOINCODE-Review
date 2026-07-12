import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { createPendingDeviceAuth } from "@/lib/cli/device-auth";

export async function POST() {
  const { deviceCode, expiresIn, interval } = await createPendingDeviceAuth();

  return NextResponse.json({
    deviceCode,
    verificationUrl: `${env.APP_URL}/cli-auth`,
    expiresIn,
    interval,
  });
}
