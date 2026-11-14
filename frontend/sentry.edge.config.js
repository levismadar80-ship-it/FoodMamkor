// Sentry edge runtime init (middleware, edge routes).
import * as Sentry from "@sentry/nextjs";
import { scrubClaimTokens } from "./lib/claim-token";
import { serverTracesSampleRate } from "./lib/sentry-sampling";
import { serverSentryEnvironment } from "./lib/sentry-environment";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Where the code runs, not NODE_ENV (which is "production" on staging too).
    environment:
      process.env.SENTRY_ENV ||
      serverSentryEnvironment(process.env.VERCEL_ENV, process.env.VERCEL_GIT_COMMIT_REF),
    // MEH-2887: 0.1 in production, 0.01 on staging / previews (span quota).
    tracesSampleRate: serverTracesSampleRate(process.env.VERCEL_ENV),
    // MEH-2324: the owner-claim link is a bearer credential in its path
    // (/claim/<token>). Redact it from anything reported.
    beforeSend: (event) => scrubClaimTokens(event),
    beforeSendTransaction: (event) => scrubClaimTokens(event),
  });
}
