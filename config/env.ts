import { z } from "zod/v4";

 // TODO: REMOVE OPTIONAL WHEN KEY IS PRESENT
const envSchema = z.object({
  DATABASE_URL: z.string(),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),

  CLERK_WEBHOOK_SECRET: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),

  APP_URL: z.string(),

  ENCRYPTION_KEY: z.string().min(32),

  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
