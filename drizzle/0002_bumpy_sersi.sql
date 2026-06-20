CREATE TYPE "public"."comment_status" AS ENUM('pending', 'applied', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."indexing_status" AS ENUM('pending', 'indexing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('anthropic', 'openai', 'google', 'openrouter');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "provider" SET DATA TYPE "public"."llm_provider" USING "provider"::"public"."llm_provider";--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "indexing_status" SET DEFAULT 'pending'::"public"."indexing_status";--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "indexing_status" SET DATA TYPE "public"."indexing_status" USING "indexing_status"::"public"."indexing_status";--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."review_status";--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "status" SET DATA TYPE "public"."review_status" USING "status"::"public"."review_status";