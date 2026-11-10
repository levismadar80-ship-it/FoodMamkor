// Sentry server-side init (Node runtime).
import * as Sentry from "@sentry/nextjs";
import { scrubClaimTokens } from "./lib/claim-token";
import { serverTracesSampleRate } from "./lib/sentry-sampling";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV,
    // MEH-2887: 0.1 in production, 0.01 on staging / previews (span quota).
    tracesSampleRate: serverTracesSampleRate(process.env.VERCEL_ENV),
    // MEH-2324: the owner-claim link is a bearer credential in its path
    // (/claim/<token>). Redact it from anything reported.
    beforeSend: (event) => scrubClaimTokens(event),
    beforeSendTransaction: (event) => scrubClaimTokens(event),
  });
}
