import { z } from "zod/v4";

// Shared across connect/disconnect/status — all three take the same
// provider-qualified owner/repo pair, whether from a JSON body (connect,
// disconnect) or query params (status). `owner` is widened from GitHub's
// 39-char username limit to 100 — Azure DevOps owner is "organization/project",
// which can exceed a single GitHub username's length. `provider` defaults to
// "github" so already-installed CLI binaries (which send no `provider` field)
// keep working unmodified; new CLI versions send it explicitly.
export const repoRefSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  provider: z.enum(["github", "gitlab", "azure_devops"]).default("github"),
});

export const deviceTokenPollSchema = z.object({
  deviceCode: z.string().min(1).max(200),
});

export const keySyncSchema = z.object({
  provider: z.enum(["anthropic", "openai", "google", "openrouter"]),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});
