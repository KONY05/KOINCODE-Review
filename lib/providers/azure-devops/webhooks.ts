import crypto from "node:crypto";

import { env, getAppUrl } from "@/config/env";
import type { CreateWebhookResult } from "../types";
import { AzureDevOpsApiError, azureFetch, splitOwner } from "./client";

const EVENT_TYPES = ["git.pullrequest.created", "git.pullrequest.updated"] as const;

/** Sent alongside the (shared or per-repo) secret as Basic Auth — Azure DevOps service hooks authenticate deliveries via Basic Auth, not an HMAC signature header the way GitHub/GitLab do. */
export const WEBHOOK_BASIC_AUTH_USERNAME = "koincode";

function getWebhookUrl(): string {
  return `${getAppUrl()}/api/webhooks/azure-devops`;
}

type AzureSubscription = { id: string };

async function createSubscription(
  token: string,
  organization: string,
  project: string,
  repo: string,
  eventType: string,
  password: string,
): Promise<string> {
  const created = await azureFetch<AzureSubscription>(token, `/${organization}/_apis/hooks/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      publisherId: "tfs",
      eventType,
      resourceVersion: "1.0",
      consumerId: "webHooks",
      consumerActionId: "httpRequest",
      publisherInputs: { projectId: project, repository: repo },
      consumerInputs: {
        url: getWebhookUrl(),
        basicAuthUsername: WEBHOOK_BASIC_AUTH_USERNAME,
        basicAuthPassword: password,
      },
    }),
  });

  return created.id;
}

async function deleteSubscription(token: string, organization: string, id: string): Promise<void> {
  await azureFetch<void>(token, `/${organization}/_apis/hooks/subscriptions/${id}`, {
    method: "DELETE",
  });
}

/**
 * Confirmed via live testing: Azure DevOps doesn't actually return 403 for
 * "this identity lacks permission to manage service hook subscriptions" —
 * it returns 400 with an ArgumentException whose message says so in plain
 * English ("The user '...' does not have permission to edit a
 * subscription."). Org-level "Edit subscription" rights are typically
 * reserved for Project Collection Administrators, well above the "Basic"
 * access level most linked accounts will have — so this is actually the
 * *common* case for the hooks_write scope being technically granted by
 * Entra but still not usable, not an edge case.
 */
function isPermissionDenied(error: unknown): boolean {
  if (!(error instanceof AzureDevOpsApiError)) return false;
  if (error.status === 403) return true;
  return error.status === 400 && /does not have permission/i.test(error.message);
}

/**
 * Hybrid, per the Feature 19 spec: Microsoft's docs mark vso.hooks_write as
 * "no longer public," so whether a given Entra app registration can actually
 * manage service hook subscriptions is only discoverable by trying — a
 * permission-denied response (see isPermissionDenied above — confirmed via
 * live testing to actually come back as a 400, not 403) falls back to a
 * manual setup result rather than throwing.
 *
 * One subscription per eventType is required (Azure DevOps has no single
 * webhook covering multiple event types the way GitHub's/GitLab's single
 * webhook config does) — both are created best-effort, and if the second
 * 403s after the first succeeded, the first is torn down again so a repo
 * never ends up half auto-configured.
 *
 * Known gap: git.pullrequest.updated fires for *any* PR metadata change
 * (title, reviewers, labels, status), not specifically "new commits
 * pushed" — unlike GitHub's synchronize action or GitLab's oldrev, its
 * payload carries no before/after commit shas to detect that distinction.
 * Re-review-on-push and adoption tracking aren't wired for Azure DevOps in
 * this pass as a result (see app/api/webhooks/azure-devops/route.ts) — only
 * initial review on PR creation and cancel-on-merge/close are supported.
 */
export async function createRepoWebhook(
  token: string,
  owner: string,
  repo: string,
): Promise<CreateWebhookResult> {
  const { organization, project } = splitOwner(owner);
  const createdIds: string[] = [];

  try {
    if (!env.AZURE_DEVOPS_WEBHOOK_SECRET) {
      throw new Error(
        "AZURE_DEVOPS_WEBHOOK_SECRET is not configured — cannot auto-create an Azure DevOps service hook without a secret to verify it with.",
      );
    }

    for (const eventType of EVENT_TYPES) {
      const id = await createSubscription(
        token,
        organization,
        project,
        repo,
        eventType,
        env.AZURE_DEVOPS_WEBHOOK_SECRET,
      );
      createdIds.push(id);
    }

    return { status: "created", webhookId: createdIds.join(",") };
  } catch (error) {
    for (const id of createdIds) {
      await deleteSubscription(token, organization, id).catch(() => {});
    }

    if (isPermissionDenied(error)) {
      return { status: "manual", secret: crypto.randomBytes(32).toString("hex") };
    }

    throw error;
  }
}

export async function deleteRepoWebhook(
  token: string,
  owner: string,
  _repo: string,
  webhookId: string,
): Promise<void> {
  const { organization } = splitOwner(owner);

  for (const id of webhookId.split(",")) {
    await deleteSubscription(token, organization, id);
  }
}
