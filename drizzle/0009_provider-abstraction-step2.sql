ALTER TABLE "repos" DROP CONSTRAINT "repos_user_id_github_id_unique";--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "external_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN "github_id";--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_user_id_provider_external_id_unique" UNIQUE("user_id","provider","external_id");