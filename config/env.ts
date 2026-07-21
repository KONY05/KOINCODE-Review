import { z } from "zod/v4";

const envSchema = z.object({
  DATABASE_URL: z.string(),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),

  CLERK_WEBHOOK_SECRET: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),
  // Optional: GitLab isn't configured as a Clerk social connection in every
  // environment yet (Feature 18 needs a GitLab OAuth app + Clerk dashboard
  // setup done manually first). The webhook route 401s if this is unset
  // rather than the whole app failing to boot without it.
  GITLAB_WEBHOOK_SECRET: z.string().optional(),
  // Optional for the same reason as GITLAB_WEBHOOK_SECRET above (Feature 19
  // needs a custom Entra ID app registration set up manually first). Used
  // as the Basic Auth password only for the auto-created service hook path —
  // the manual-fallback path uses a per-repo secret instead (repos.webhookSecret).
  AZURE_DEVOPS_WEBHOOK_SECRET: z.string().optional(),

  APP_URL: z.string(),

  ENCRYPTION_KEY: z.string().min(32),

  PINECONE_API_KEY: z.string(),
  PINECONE_INDEX: z.string(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string(),

  NEXT_PUBLIC_SENTRY_DSN: z.string(),
  SENTRY_ORG: z.string(),
  SENTRY_PROJECT: z.string(),

  NEXT_PUBLIC_MIXPANEL_TOKEN: z.string(),
});

export const env = envSchema.parse(process.env);

/**
 * The base URL to use for callbacks (e.g. webhook registration) that must
 * resolve to the instance actually running the code — not APP_URL's fixed
 * value, which only makes sense for Production/local dev. Preview
 * deployments get a unique URL per deployment (Vercel's own VERCEL_URL),
 * so registering a webhook against the static APP_URL from a Preview build
 * would point GitHub/GitLab/Azure DevOps at the wrong (e.g. production)
 * instance — a real problem now that Preview runs against its own Neon
 * branch DB, not production's.
 */
export function getAppUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return env.APP_URL;
}
