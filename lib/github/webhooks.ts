import { Octokit } from "@octokit/rest";

import { env } from "@/config/env";

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
): Promise<number> {
  const octokit = new Octokit({ auth: token });

  const existingId = await findExistingWebhook(octokit, owner, repo);
  if (existingId) return existingId;

  const response = await octokit.repos.createWebhook({
    owner,
    repo,
    config: {
      url: getWebhookUrl(),
      content_type: "json",
      secret: env.GITHUB_WEBHOOK_SECRET,
    },
    events: ["pull_request"],
    active: true,
  });

  return response.data.id;
}

export async function deleteRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  webhookId: number
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  await octokit.repos.deleteWebhook({
    owner,
    repo,
    hook_id: webhookId,
  });
}
