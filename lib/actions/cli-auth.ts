"use server";

import { getAuthUser } from "@/lib/actions/auth";
import { approveDeviceAuth, denyDeviceAuth } from "@/lib/cli/device-auth";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

export async function approveCliDevice(deviceCode: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return fail("Unauthorized");

  const approved = await approveDeviceAuth(deviceCode, user.id);
  if (!approved) {
    return fail("This code has expired. Run /review-login again from the CLI.");
  }

  return ok(null);
}

export async function denyCliDevice(deviceCode: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return fail("Unauthorized");

  await denyDeviceAuth(deviceCode);
  return ok(null);
}
