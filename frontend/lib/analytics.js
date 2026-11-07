// MEH-435: PostHog is loaded lazily the first time a production event fires
// with a key configured, then reused. Module-level singleton so init runs
// once regardless of how many events queue behind it (posthog buffers its
// own captures internally). Key unset → this is never reached (early return
// below), so the no-op behaviour that predated MEH-435 is preserved exactly.
import { hasFullCookieConsent } from "@/lib/cookie-consent";
import { scrubClaimTokens } from "@/lib/claim-token";
let posthogPromise = null;

function loadPosthog(key) {
  if (!posthogPromise) {
    posthogPromise = import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        // EU ingestion host by default (data residency); override per-env
        // with NEXT_PUBLIC_POSTHOG_HOST. `eu.i.posthog.com` is PostHog's
        // ingestion host (eu.posthog.com is the app UI); it must match
        // connect-src in next.config.js (MEH-435).
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
          process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
        // Consent is already enforced by the cookieConsent gate in
        // trackEvent (this path is only reached when consent === "all");
        // we drive captures explicitly, so disable posthog's autocapture
        // and automatic pageviews.
        autocapture: false,
        capture_pageview: false,
        person_profiles: "identified_only",
        // MEH-2777: strip bearer tokens out of every event before it leaves
        // the browser. See scrubEvent below for why this is not redundant with
        // the two `false`s above it.
        before_send: scrubEvent,
      });
      return posthog;
    });
  }
  return posthogPromise;
}

/**
 * PostHog `before_send` — runs on every event immediately before it is sent,
 * and may edit it (`BeforeSendFn`, @posthog/types/dist/capture.d.ts:88).
 *
 * MEH-2777. Two bearer credentials live in a URL PATH on this site: the
 * owner-claim link (/claim/<jwt>, MEH-2321) and the sign-up cancel link
 * (/registration/<token>, MEH-2768). Whoever holds either one can act with it,
 * so neither may reach a third-party analytics store. Sentry
 * (sentry.*.config.js) and Speed Insights (SpeedInsightsRedacted.jsx) already
 * scrub through the same helper; this is the third and last consumer.
 *
 * WHY THIS IS NOT ALREADY HANDLED by `autocapture: false` +
 * `capture_pageview: false` above. Those suppress automatic EVENTS. They say
 * nothing about the `$current_url` / `$pathname` PROPERTIES, which
 * `getEventProperties()` attaches to EVERY capture from `location.href`
 * unconditionally — measured in the installed package at
 * @posthog/browser-common/dist/utils/event-utils.mjs:227 and :229. PostHog's
 * own `maskQueryParams` masks query parameters only; a token in the path goes
 * through whole.
 *
 * So today's safety is an accident of call sites, not a property of the
 * config: every trackEvent() caller happens to sit on /, /producers or
 * /register/producer, and the token routes import no analytics at all. One
 * trackEvent added to CancelRegistrationClient.jsx would leak a live
 * credential with nothing going red. This hook closes that by construction.
 *
 * NOT `sanitize_properties`, which is the obvious-looking option and is wrong:
 * it is deprecated in the installed posthog-js 1.422.1
 * (@posthog/types/dist/posthog-config.d.ts:1827) and logs a console error on
 * every single event.
 *
 * Returning the event (never null) — this redacts, it does not drop.
 */
export function scrubEvent(captureResult) {
  return scrubClaimTokens(captureResult);
}

export function trackEvent(name, props = {}) {
  if (typeof window === "undefined") return;
  if (!hasFullCookieConsent()) return;
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
