CREATE TYPE "public"."usage_action" AS ENUM('review', 'embedding', 'memory_extraction');--> statement-breakpoint
CREATE TYPE "public"."usage_status" AS ENUM('success', 'failed');--> statement-breakpoint
ALTER TABLE "key_usage_logs" ALTER COLUMN "action" SET DATA TYPE "public"."usage_action" USING "action"::"public"."usage_action";--> statement-breakpoint
ALTER TABLE "key_usage_logs" ALTER COLUMN "provider" SET DATA TYPE "public"."llm_provider" USING "provider"::"public"."llm_provider";--> statement-breakpoint
ALTER TABLE "key_usage_logs" ALTER COLUMN "status" SET DATA TYPE "public"."usage_status" USING "status"::"public"."usage_status";