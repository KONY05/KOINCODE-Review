import { Webhook } from "svix";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/config/env";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: { email_address: string }[];
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    external_accounts: {
      provider: string;
      username: string | null;
    }[];
  };
}

export async function POST(request: NextRequest) {
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 401 });
  }

  if (!env.CLERK_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();

  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "user.created") {
    return NextResponse.json({ received: true });
  }

  const { data } = event;

  const githubAccount = data.external_accounts.find(
    (a) => a.provider === "oauth_github"
  );

  const fullName =
    [data.first_name, data.last_name].filter(Boolean).join(" ") ||
    githubAccount?.username ||
    null;

  await db
    .insert(users)
    .values({
      clerkId: data.id,
      email: data.email_addresses[0].email_address,
      name: fullName,
      avatarUrl: data.image_url,
      githubUsername: githubAccount?.username ?? null,
    })
    .onConflictDoNothing({ target: users.clerkId });

  console.log("Webhook received, user created")

  return NextResponse.json({ received: true });
}
