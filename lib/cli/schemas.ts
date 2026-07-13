import { z } from "zod/v4";

// Shared across connect/disconnect/status — all three take the same GitHub
// owner/repo pair, whether from a JSON body (connect, disconnect) or query
// params (status). Bounded to GitHub's real limits (39-char username, 100-char
// repo name) rather than an arbitrary cap, mostly to reject junk cheaply
// before it ever reaches an outbound GitHub API call.
export const repoRefSchema = z.object({
  owner: z.string().min(1).max(39),
  repo: z.string().min(1).max(100),
});

export const deviceTokenPollSchema = z.object({
  deviceCode: z.string().min(1).max(200),
});
