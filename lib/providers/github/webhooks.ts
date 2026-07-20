import { Octokit } from "@octokit/rest";

import { env } from "@/config/env";
import type { CreateWebhookResult } from "../types";

function getWebhookUrl(): string {
  return `${env.APP_URL}/api/webhooks/github`;
}

async function findExistingWebhook(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<number | null> {
  const webhookUrl = getWebhookUrl();
  const { data: hooks } = await octokit.repos.listWebhooks({ owner, repo });

  const existing = hooks.find((h) => h.config.url === webhookUrl);
  return existing?.id ?? null;
}

export async function createRepoWebhook(
  token: string,
  owner: string,
  repo: string
): Promise<CreateWebhookResult> {
  const octokit = new Octokit({ auth: token });

  const existingId = await findExistingWebhook(octokit, owner, repo);
  if (existingId) return { status: "created", webhookId: String(existingId) };

  const response = await octokit.repos.createWebhook({
    owner,
    repo,
    config: {
      url: getWebhookUrl(),
      content_type: "json",
      secret: env.GITHUB_WEBHOOK_SECRET,
    },
    events: ["pull_request", "pull_request_review_comment"],
    active: true,
  });

  return { status: "created", webhookId: String(response.data.id) };
}

export async function deleteRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  webhookId: string
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  await octokit.repos.deleteWebhook({
    owner,
    repo,
    hook_id: Number(webhookId),
  });
}
