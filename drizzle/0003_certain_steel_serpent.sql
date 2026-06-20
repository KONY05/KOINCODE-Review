ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_provider_unique" UNIQUE("user_id","provider");--> statement-breakpoint
DROP TYPE "public"."comment_status";