import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

import { repos } from "./repos";
import { users } from "./users";

export const repoMemories = pgTable("repo_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rule: text("rule").notNull(),
  sourceUrl: text("source_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
