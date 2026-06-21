import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { apiKeys, llmProviderEnum } from "./api-keys";
import { repos } from "./repos";
import { reviews } from "./reviews";

export const usageActionEnum = pgEnum("usage_action", [
  "review",
  "embedding",
  "memory_extraction",
]);

export const usageStatusEnum = pgEnum("usage_status", [
  "success",
  "failed",
]);

export type UsageAction = (typeof usageActionEnum.enumValues)[number];

export type UsageStatus = (typeof usageStatusEnum.enumValues)[number];

export const keyUsageLogs = pgTable("key_usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
    onDelete: "set null",
  }),
  repoId: uuid("repo_id").references(() => repos.id, {
    onDelete: "set null",
  }),
  reviewId: uuid("review_id").references(() => reviews.id, {
    onDelete: "set null",
  }),
  action: usageActionEnum("action").notNull(),
  provider: llmProviderEnum("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  status: usageStatusEnum("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
