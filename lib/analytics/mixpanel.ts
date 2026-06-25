import mixpanelBrowser from "mixpanel-browser";

let clientInitialized = false;

export function initMixpanelClient() {
  if (process.env.NODE_ENV !== "production") return;

  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token || clientInitialized) return;

  mixpanelBrowser.init(token, {
    track_pageview: false,
    persistence: "localStorage",
  });
  clientInitialized = true;
}

export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>
) {
  if (!clientInitialized) return;

  mixpanelBrowser.identify(userId);
  if (properties) {
    mixpanelBrowser.people.set(properties);
  }
}

export function trackClient(
  event: string,
  properties?: Record<string, unknown>
) {
  if (!clientInitialized) return;
  mixpanelBrowser.track(event, properties);
}

export function resetMixpanel() {
  if (!clientInitialized) return;
  mixpanelBrowser.reset();
}
