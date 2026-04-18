export function trackEvent(name, props = {}) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[track]", name, props);
    return;
  }
  // Production hook: wire to Plausible / PostHog in a future PR.
}
