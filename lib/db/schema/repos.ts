import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const indexingStatusEnum = pgEnum("indexing_status", [
  "pending",
  "indexing",
  "completed",
  "failed",
]);

// Only "github" exists today — add "gitlab" / "azure_devops" as those
// providers actually land (Features 18/19), not speculatively here.
export const gitProviderEnum = pgEnum("git_provider", ["github"]);

export const repos = pgTable(
  "repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: gitProviderEnum("provider").notNull().default("github"),
    // Provider-native repo identifier: GitHub's numeric id, GitLab's numeric
    // project id, Azure DevOps's GUID repository id — text covers all three.
    externalId: text("external_id").notNull(),
    fullName: text("full_name").notNull(),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    isPrivate: boolean("is_private").notNull().default(false),
    // Provider-native webhook/service-hook identifier — text for the same
    // reason as externalId (Azure DevOps service hook ids are GUIDs).
    webhookId: text("webhook_id"),
    isActive: boolean("is_active").notNull().default(true),
    indexingStatus: indexingStatusEnum("indexing_status").notNull().default("pending"),
    disconnectedAt: timestamp("disconnected_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.userId, t.provider, t.externalId)]
);
