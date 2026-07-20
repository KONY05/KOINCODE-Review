import { env } from "@/config/env";
import type { CreateWebhookResult } from "../types";
import { gitlabFetch, projectPath } from "./client";

type GitlabHook = {
  id: number;
  url: string;
};

function getWebhookUrl(): string {
  return `${env.APP_URL}/api/webhooks/gitlab`;
}

export async function createRepoWebhook(
  token: string,
  owner: string,
  repo: string,
): Promise<CreateWebhookResult> {
  if (!env.GITLAB_WEBHOOK_SECRET) {
    throw new Error(
      "GITLAB_WEBHOOK_SECRET is not configured — cannot create a GitLab webhook without a secret to verify it with.",
    );
  }

  const id = projectPath(owner, repo);
  const webhookUrl = getWebhookUrl();

  const existingHooks = await gitlabFetch<GitlabHook[]>(token, `/projects/${id}/hooks`);
  const existing = existingHooks.find((h) => h.url === webhookUrl);
  if (existing) return { status: "created", webhookId: String(existing.id) };

  const created = await gitlabFetch<GitlabHook>(token, `/projects/${id}/hooks`, {
    method: "POST",
    body: JSON.stringify({
      url: webhookUrl,
      token: env.GITLAB_WEBHOOK_SECRET,
      merge_requests_events: true,
      note_events: true,
      enable_ssl_verification: true,
    }),
  });

  return { status: "created", webhookId: String(created.id) };
}

export async function deleteRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  webhookId: string,
): Promise<void> {
  const id = projectPath(owner, repo);
  await gitlabFetch<void>(token, `/projects/${id}/hooks/${webhookId}`, {
    method: "DELETE",
  });
}
