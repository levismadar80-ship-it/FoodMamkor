// Sentry client-side init.
//
// Next.js runs instrumentation-client.js in the browser before the app
// hydrates. MEH-2536: this used to be sentry.client.config.js, which
// @sentry/nextjs only injects through webpack; Next 16 builds with Turbopack,
// so the file was never loaded and the browser sent Sentry nothing.
// Runs only when NEXT_PUBLIC_SENTRY_DSN is set so local dev and CI stay quiet.
import * as Sentry from "@sentry/nextjs";
import { scrubClaimTokens } from "./lib/claim-token";
import { clientTracesSampleRate } from "./lib/sentry-sampling";
import { replayAllowed } from "./lib/sentry-replay-gate";
import { hasFullCookieConsent, COOKIE_CONSENT_EVENT } from "./lib/cookie-consent";
import { clientSentryEnvironment, shouldDropClientEvent } from "./lib/sentry-environment";

const currentNavigator = () => (typeof navigator !== "undefined" ? navigator : undefined);

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// MEH-2324 / MEH-3193: a replay records the page URL in rrweb events, which
// replays send without beforeSend and which beforeAddRecordingEvent cannot
// modify — so a tab that opens on a bearer-token link (/claim/<token>,
// /owner-invite/<token>) records no replay at all. A replay is also a session
// recording, so it waits for the "all" cookie answer, like Clarity does.
const pathname = typeof window !== "undefined" ? window.location.pathname : "";
const makeReplay = () =>
  Sentry.replayIntegration({
    maskAllText: true,
    maskAllInputs: true,
    blockAllMedia: true,
  });

if (dsn) {
  Sentry.init({
    dsn,
    // Where the page runs, not NODE_ENV (which is "production" on staging too).
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENV ||
      clientSentryEnvironment(typeof window !== "undefined" ? window.location.hostname : ""),
    // MEH-2887: 0.1 on mehamakor.co.il, 0.01 on staging / previews (span quota).
    tracesSampleRate: clientTracesSampleRate(typeof window !== "undefined" ? window.location.hostname : ""),
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [],
    beforeSend(event) {
      // Local dev, and our own E2E runs / QA probes (navigator.webdriver),
      // which stub API failures on purpose: noise, not user errors.
      if (shouldDropClientEvent(process.env.NODE_ENV, currentNavigator())) return null;
      // MEH-2324: the owner-claim link is a bearer credential in its path
      // (/claim/<token>). Redact it from the URL, breadcrumbs and context.
      return scrubClaimTokens(event);
    },
    beforeSendTransaction: (event) =>
      shouldDropClientEvent(process.env.NODE_ENV, currentNavigator()) ? null : scrubClaimTokens(event),
  });

  // Added after init, only once allowed: now if she already accepted all
  // cookies, otherwise the moment she does (the banner fires the event).
  let replayOn = false;
  const maybeAddReplay = () => {
    if (replayOn || !replayAllowed(pathname, hasFullCookieConsent())) return;
    replayOn = true;
    Sentry.addIntegration(makeReplay());
  };
  if (typeof window !== "undefined") {
    maybeAddReplay();
    window.addEventListener(COOKIE_CONSENT_EVENT, maybeAddReplay);
  }
}

// Navigation spans for the App Router (Sentry's instrumentation-client hook).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
