// Sentry server-side init (Node runtime).
import * as Sentry from "@sentry/nextjs";
import { scrubClaimTokens } from "./lib/claim-token";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // MEH-2324: the owner-claim link is a bearer credential in its path
    // (/claim/<token>). Redact it from anything reported.
    beforeSend: (event) => scrubClaimTokens(event),
    beforeSendTransaction: (event) => scrubClaimTokens(event),
  });
}
