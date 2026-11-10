/**
 * Module:   sentry-sampling
 * Purpose:  MEH-2887 — one place that decides the Sentry traces sample rate,
 *           so staging and previews stop burning the span quota production
 *           shares with them (≈95% of it, docs/audits/2026-11-quota-inventory.md).
 * How:      production keeps 0.1; anything else gets 0.01.
 *           - Browser: the page's hostname (mehamakor.co.il / www.).
 *           - Server / edge: VERCEL_ENV, which Vercel sets on every
 *             deployment ("production" only for the production domain).
 *           No new env var: NEXT_PUBLIC_SENTRY_ENV / SENTRY_ENV are not set
 *           for staging today (Sentry shows frontend events only as
 *           "production" or no environment), so they cannot tell staging apart.
 * Does NOT: change error sampling or replays — errors are still sent in full.
 * History:  MEH-2887 (creation).
 */

const PRODUCTION_TRACES_SAMPLE_RATE = 0.1;
const NON_PRODUCTION_TRACES_SAMPLE_RATE = 0.01;

const PRODUCTION_HOSTS = new Set(["mehamakor.co.il", "www.mehamakor.co.il"]);

/** Browser: decide by the hostname the page was served from. */
export function clientTracesSampleRate(hostname) {
  return PRODUCTION_HOSTS.has(String(hostname || "").toLowerCase())
    ? PRODUCTION_TRACES_SAMPLE_RATE
    : NON_PRODUCTION_TRACES_SAMPLE_RATE;
}

/** Server / edge: decide by Vercel's own deployment environment. */
export function serverTracesSampleRate(vercelEnv) {
  return vercelEnv === "production" ? PRODUCTION_TRACES_SAMPLE_RATE : NON_PRODUCTION_TRACES_SAMPLE_RATE;
}
