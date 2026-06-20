import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const llmProviderEnum = pgEnum("llm_provider", [
  "anthropic",
  "openai",
  "google",
  "openrouter",
]);

export type LlmProvider = (typeof llmProviderEnum.enumValues)[number];

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: llmProviderEnum("provider").notNull(),
  model: text("model").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
