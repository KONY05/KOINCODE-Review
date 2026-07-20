ALTER TYPE "public"."git_provider" ADD VALUE 'azure_devops';--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "webhook_secret" text;