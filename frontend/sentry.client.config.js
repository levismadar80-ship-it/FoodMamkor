// Sentry client-side init.
//
// Loaded automatically by @sentry/nextjs in the browser. Runs only when
// NEXT_PUBLIC_SENTRY_DSN is set so local dev and CI stay quiet.
import * as Sentry from "@sentry/nextjs";
import { scrubClaimTokens } from "./lib/claim-token";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
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
