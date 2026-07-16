CREATE TYPE "public"."git_provider" AS ENUM('github');--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "webhook_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "provider" "git_provider" DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "external_id" text;