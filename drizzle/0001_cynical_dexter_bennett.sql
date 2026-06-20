ALTER TABLE "repos" ADD COLUMN "indexing_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "disconnected_at" timestamp;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_user_id_github_id_unique" UNIQUE("user_id","github_id");