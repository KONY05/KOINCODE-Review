export type ReviewFixture = {
  name: string;
  prTitle: string;
  headBranch: string;
  baseBranch: string;
  diff: string;
  fileContents: Record<string, string>;
  expectedIssue: string;
};

export const reviewFixtures: ReviewFixture[] = [
  {
    name: "sql-injection",
    prTitle: "Add lookup by username to user search",
    headBranch: "feat/user-search",
    baseBranch: "main",
    expectedIssue:
      "Raw string concatenation of `username` into a SQL query — classic SQL injection.",
    diff: `diff --git a/lib/db/users.ts b/lib/db/users.ts
index 1111111..2222222 100644
--- a/lib/db/users.ts
+++ b/lib/db/users.ts
@@ -1,5 +1,10 @@
 import { db } from "./client";

 export async function getUserById(id: string) {
   return db.query("SELECT * FROM users WHERE id = $1", [id]);
 }
+
+export async function findByUsername(username: string) {
+  const query = "SELECT * FROM users WHERE username = '" + username + "'";
+  return db.query(query);
+}
`,
    fileContents: {
      "lib/db/users.ts": `import { db } from "./client";

export async function getUserById(id: string) {
  return db.query("SELECT * FROM users WHERE id = $1", [id]);
}

export async function findByUsername(username: string) {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  return db.query(query);
}
`,
    },
  },
  {
    name: "missing-await-race-condition",
    prTitle: "Delete account and its related records",
    headBranch: "fix/account-deletion",
    baseBranch: "main",
    expectedIssue:
      "`clearUserSessions` is not awaited, so the account row can be deleted before sessions finish clearing — a race condition, and any rejection is unhandled.",
    diff: `diff --git a/lib/actions/account.ts b/lib/actions/account.ts
index 3333333..4444444 100644
--- a/lib/actions/account.ts
+++ b/lib/actions/account.ts
@@ -1,7 +1,12 @@
 import { db } from "@/lib/db";
 import { users } from "@/lib/db/schema";
 import { eq } from "drizzle-orm";
+import { clearUserSessions } from "@/lib/auth/sessions";

 export async function deleteAccount(userId: string) {
+  clearUserSessions(userId);
+
   await db.delete(users).where(eq(users.id, userId));
+
+  return { ok: true };
 }
`,
    fileContents: {
      "lib/actions/account.ts": `import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { clearUserSessions } from "@/lib/auth/sessions";

export async function deleteAccount(userId: string) {
  clearUserSessions(userId);

  await db.delete(users).where(eq(users.id, userId));

  return { ok: true };
}
`,
    },
  },
  {
    name: "hardcoded-secret",
    prTitle: "Wire up Stripe webhook verification",
    headBranch: "feat/stripe-webhook",
    baseBranch: "main",
    expectedIssue:
      "Stripe webhook signing secret is hardcoded in source instead of read from an environment variable.",
    diff: `diff --git a/app/api/webhooks/stripe/route.ts b/app/api/webhooks/stripe/route.ts
index 5555555..6666666 100644
--- a/app/api/webhooks/stripe/route.ts
+++ b/app/api/webhooks/stripe/route.ts
@@ -1,8 +1,15 @@
 import Stripe from "stripe";

+const STRIPE_WEBHOOK_SECRET = "whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
+
 export async function POST(req: Request) {
   const body = await req.text();
   const signature = req.headers.get("stripe-signature")!;
-  return new Response("ok");
+
+  const event = Stripe.webhooks.constructEvent(
+    body,
+    signature,
+    STRIPE_WEBHOOK_SECRET
+  );
+
+  return new Response(JSON.stringify({ received: true, type: event.type }));
 }
`,
    fileContents: {
      "app/api/webhooks/stripe/route.ts": `import Stripe from "stripe";

const STRIPE_WEBHOOK_SECRET = "whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  const event = Stripe.webhooks.constructEvent(
    body,
    signature,
    STRIPE_WEBHOOK_SECRET
  );

  return new Response(JSON.stringify({ received: true, type: event.type }));
}
`,
    },
  },
];
