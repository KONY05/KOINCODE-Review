import Mixpanel from "mixpanel";

let serverClient: ReturnType<typeof Mixpanel.init> | null = null;

function getServerClient() {
  if (process.env.NODE_ENV !== "production") return null;
  if (serverClient) return serverClient;

  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token) return null;

  serverClient = Mixpanel.init(token);
  return serverClient;
}

export async function trackServer(
  event: string,
  userId: string,
  properties?: Record<string, unknown>
) {
  const client = getServerClient();
  if (!client) return;

  client.track(event, {
    distinct_id: userId,
    ...properties,
  });
}
