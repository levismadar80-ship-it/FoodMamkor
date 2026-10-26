// Sentry client-side init.
//
// Loaded automatically by @sentry/nextjs in the browser. Runs only when
// NEXT_PUBLIC_SENTRY_DSN is set so local dev and CI stay quiet.
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
