import { z } from "zod/v4";

const envSchema = z.object({
  DATABASE_URL: z.string(),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),

  CLERK_WEBHOOK_SECRET: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),

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
 * would point GitHub/GitLab at the wrong (e.g. production) instance.
 */
export function getAppUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return env.APP_URL;
}
