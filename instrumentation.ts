import * as Sentry from "@sentry/nextjs";

export async function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // See sentry.client.config.ts for why VERCEL_ENV (not NODE_ENV) is used
    // for the environment tag — NODE_ENV can't distinguish Preview from
    // Production on Vercel, VERCEL_ENV can.
    environment: process.env.VERCEL_ENV ?? "development",
    enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
  });
}

export const onRequestError = Sentry.captureRequestError;
