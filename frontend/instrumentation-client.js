// Sentry client-side init.
//
// Next.js runs instrumentation-client.js in the browser before the app
// hydrates. MEH-2536: this used to be sentry.client.config.js, which
// @sentry/nextjs only injects through webpack; Next 16 builds with Turbopack,
// so the file was never loaded and the browser sent Sentry nothing.
// Runs only when NEXT_PUBLIC_SENTRY_DSN is set so local dev and CI stay quiet.
import * as Sentry from "@sentry/nextjs";
import { scrubClaimTokens } from "./lib/claim-token";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// MEH-2324: a replay records the page URL in rrweb events, which replays send
// without beforeSend and which beforeAddRecordingEvent cannot modify. A tab
// that opens on the owner-claim link (/claim/<token>, a bearer credential)
// therefore records no replay at all. The link always arrives as a full load.
const onClaimLink =
  typeof window !== "undefined" && /\/claim\/[^/]/.test(window.location.pathname);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: onClaimLink
      ? []
      : [
          Sentry.replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
          }),
        ],
    beforeSend(event) {
      if (process.env.NODE_ENV === "development") return null;
      // MEH-2324: the owner-claim link is a bearer credential in its path
      // (/claim/<token>). Redact it from the URL, breadcrumbs and context.
      return scrubClaimTokens(event);
    },
    beforeSendTransaction: (event) => scrubClaimTokens(event),
  });
}

// Navigation spans for the App Router (Sentry's instrumentation-client hook).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
