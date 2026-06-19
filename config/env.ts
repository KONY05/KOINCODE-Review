import { z } from "zod/v4";

const envSchema = z.object({
  DATABASE_URL: z.string(),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),

  CLERK_WEBHOOK_SECRET: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(), // TODO: REMOVE OPTIONAL WHEN KEY IS PRESENT

  ENCRYPTION_KEY: z.string().min(32),
});

export const env = envSchema.parse(process.env);
