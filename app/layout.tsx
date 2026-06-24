import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "KOINCODE Review",
    template: "%s · KOINCODE Review",
  },
  description:
    "AI-powered code review agent — get automated reviews with fix suggestions on every pull request. Bring your own LLM key, connect your repos, ship better code.",
  keywords: [
    "code review",
    "AI code review",
    "pull request review",
    "automated code review",
    "GitHub",
    "LLM",
    "BYOK",
    "developer tools",
  ],
  authors: [{ name: "KOINCODE" }],
  creator: "KOINCODE",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    siteName: "KOINCODE Review",
    title: "KOINCODE Review",
    description:
      "AI-powered code review agent — automated reviews with fix suggestions on every pull request.",
  },
  twitter: {
    card: "summary",
    title: "KOINCODE Review",
    description:
      "AI-powered code review agent — automated reviews with fix suggestions on every pull request.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <ThemeProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
