/**
 * Module:   sentry-environment
 * Purpose:  Label every Sentry event with where it really ran.
 *           NODE_ENV is "production" in every Vercel build, staging included,
 *           so staging events used to arrive as "production" — on 14/11 a
 *           burst of staging QA traffic sent an «Escalating issue» email for
 *           production while production had no such error.
 * How:      - Browser: the page's hostname.
 *           - Server / edge: VERCEL_ENV plus VERCEL_GIT_COMMIT_REF (both set
 *             by Vercel itself; no new env var).
 *           - isAutomatedBrowser: navigator.webdriver is true under
 *             Playwright / Puppeteer / Selenium. Those runs are our own E2E
 *             and QA probes, which stub failures on purpose, so the browser
 *             SDK drops their events.
 * Does NOT: change sampling (lib/sentry-sampling.js) or what is scrubbed.
 */

const PRODUCTION_HOSTS = new Set(["mehamakor.co.il", "www.mehamakor.co.il"]);
const STAGING_HOSTS = new Set(["staging.mehamakor.online"]);

/** Browser: decide by the hostname the page was served from. */
export function clientSentryEnvironment(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (PRODUCTION_HOSTS.has(host)) return "production";
  if (STAGING_HOSTS.has(host)) return "staging";
  if (host.endsWith(".vercel.app")) return "preview";
  return "development";
}

/** Server / edge: decide by Vercel's own deployment environment and branch. */
export function serverSentryEnvironment(vercelEnv, gitRef) {
  if (vercelEnv === "production") return "production";
  if (gitRef === "staging") return "staging";
  if (vercelEnv === "preview") return "preview";
  return "development";
}

/** True when the browser is driven by automation (navigator.webdriver). */
export function isAutomatedBrowser(nav) {
  return Boolean(nav && nav.webdriver === true);
}
