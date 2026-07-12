import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const deviceAuthStatusEnum = pgEnum("device_auth_status", [
  "pending",
  "approved",
  "denied",
]);

// Postgres-backed (not in-memory) because this app runs on Vercel — separate
// requests (the CLI's initial POST, the browser's approve action, each poll)
// have no guarantee of hitting the same function instance, so state shared
// between them has to live somewhere durable. Rows are short-lived (~5 min)
// and low-volume; cleanup is opportunistic (see lib/cli/device-auth.ts), no
// dedicated cron needed.
export const pendingDeviceAuth = pgTable("pending_device_auth", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceCode: text("device_code").notNull().unique(),
  status: deviceAuthStatusEnum("status").notNull().default("pending"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // set by the approve action
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
