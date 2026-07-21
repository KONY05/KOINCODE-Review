import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  // The username from whichever git provider the account first signed up
  // with (GitHub, GitLab, or Azure DevOps/Microsoft) — not GitHub-specific
  // despite the column's history. Populated once, at signup, and never
  // updated afterward even if more providers get linked later.
  gitUsername: text("git_username"),
  hasCompletedOnboarding: boolean("has_completed_onboarding")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
