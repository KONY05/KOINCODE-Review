import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  unique,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const indexingStatusEnum = pgEnum("indexing_status", [
  "pending",
  "indexing",
  "completed",
  "failed",
]);

export const gitProviderEnum = pgEnum("git_provider", ["github", "gitlab", "azure_devops"]);

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
    // reason as externalId (Azure DevOps service hook ids are GUIDs). For
    // Azure DevOps this can hold multiple comma-joined subscription ids,
    // since one subscription per eventType is required there.
    webhookId: text("webhook_id"),
    // Per-repo secret for Azure DevOps's manual webhook-setup fallback only
    // (used when the org's Entra app can't be granted vso.hooks_write and the
    // user pastes this into Azure DevOps's Service Hooks Basic Auth fields
    // themselves) — null for every GitHub/GitLab repo and for Azure DevOps
    // repos whose service hook was auto-created with the shared platform
    // secret instead.
    webhookSecret: text("webhook_secret"),
    isActive: boolean("is_active").notNull().default(true),
    indexingStatus: indexingStatusEnum("indexing_status").notNull().default("pending"),
    disconnectedAt: timestamp("disconnected_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique().on(t.userId, t.provider, t.externalId),
    // Every webhook delivery looks a repo up by (provider, externalId) alone
    // (no userId in scope yet) — the unique constraint above can't serve
    // that query efficiently since userId is its leading column.
    index("repos_provider_external_id_idx").on(t.provider, t.externalId),
  ]
);
