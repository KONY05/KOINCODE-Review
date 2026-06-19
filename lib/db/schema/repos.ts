import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const repos = pgTable("repos", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  githubId: integer("github_id").notNull(),
  fullName: text("full_name").notNull(),
  name: text("name").notNull(),
  owner: text("owner").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  isPrivate: boolean("is_private").notNull().default(false),
  webhookId: integer("webhook_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
