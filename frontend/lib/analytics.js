// MEH-435: PostHog is loaded lazily the first time a production event fires
// with a key configured, then reused. Module-level singleton so init runs
// once regardless of how many events queue behind it (posthog buffers its
// own captures internally). Key unset → this is never reached (early return
// below), so the no-op behaviour that predated MEH-435 is preserved exactly.
let posthogPromise = null;

function loadPosthog(key) {
  if (!posthogPromise) {
    posthogPromise = import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        // EU ingestion host by default (data residency); override per-env
        // with NEXT_PUBLIC_POSTHOG_HOST.
        //
        // MEH-1981: this default is CITED IN THE PRIVACY POLICY
        // (`messages/{he,en}.json` → privacy.sections.third_parties.items.posthog,
        // "by default … EU servers"). Pointing NEXT_PUBLIC_POSTHOG_HOST at a
        // non-EU region makes that sentence misleading, and nothing detects it —
        // env values are not readable from a test. The copy says "by default"
        // precisely because this line is a default and not an invariant; if the
        // override is ever used in an environment, update the policy string in
        // the same change.
        api_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
        // Consent is already enforced by the cookieConsent gate in
        // trackEvent (this path is only reached when consent === "all");
        // we drive captures explicitly, so disable posthog's autocapture
        // and automatic pageviews.
        autocapture: false,
        capture_pageview: false,
        person_profiles: "identified_only",
      });
      return posthog;
    });
  }
  return posthogPromise;
}

export function trackEvent(name, props = {}) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("cookieConsent") !== "all") return;
  } catch {
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.log("[track]", name, props);
    return;
  }
  // MEH-435: production path. Capture to PostHog only when a key is
  // configured; with the key unset this returns before any import/network,
  // keeping the exact pre-MEH-435 no-op (merge-safe).
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  loadPosthog(key)
    .then((posthog) => posthog.capture(name, props))
    .catch(() => {});
}
