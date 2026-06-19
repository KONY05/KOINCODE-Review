import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  uuid,
} from "drizzle-orm/pg-core";
import { repos } from "./repos";
import { users } from "./users";

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  prNumber: integer("pr_number").notNull(),
  prTitle: text("pr_title").notNull(),
  prUrl: text("pr_url").notNull(),
  status: text("status", {
    enum: ["pending", "in_progress", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  summary: text("summary"),
  comments: jsonb("comments").$type<ReviewComment[]>(),
  model: text("model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  suggestion?: string;
  suggestedDiff?: {
    oldCode: string;
    newCode: string;
  };
  status: "pending" | "applied" | "resolved";
  githubCommentId?: number;
}
