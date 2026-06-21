import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { repos } from "./repos";
import { users } from "./users";

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];


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
  status: reviewStatusEnum("status").notNull().default("pending"),
  summary: text("summary"),
  comments: jsonb("comments").$type<ReviewComment[]>(),
  model: text("model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type ReviewComment = {
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
