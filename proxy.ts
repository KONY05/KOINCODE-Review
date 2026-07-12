import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sso-callback",
  "/cli-auth", // handles its own signed-in/signed-out branching, same as "/" and "/sso-callback"
  "/api/webhooks(.*)",
  "/api/inngest",
  "/api/cli(.*)", // device-auth routes have no Clerk session yet; repo routes use their own Bearer CLI token
  "/monitoring",
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();
  const path = request.nextUrl.pathname;

  if (userId && (path === "/" || path === "/sso-callback")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
