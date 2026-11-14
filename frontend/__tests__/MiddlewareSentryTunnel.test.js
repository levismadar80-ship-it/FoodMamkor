/**
 * MEH-2976 — the Sentry tunnel must not be caught by the locale middleware.
 *
 * next.config.js sets withSentryConfig({ tunnelRoute: "/monitoring" }): the
 * browser SDK posts every event to <site>/monitoring?o=…&p=…, and a Next
 * rewrite forwards it to Sentry ingest. Rewrites run AFTER middleware, so if
 * the catch-all matcher matches /monitoring, next-intl redirects it to
 * /he/monitoring and every browser event is lost.
 *
 * Asserted with Next's own matcher (unstable_doesMiddlewareMatch), as in
 * MiddlewareClaimMatcher.test.js. DISCRIMINATION: remove `monitoring` from the
 * negative lookahead in middleware.js → the first case fails.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

vi.mock("next-intl/middleware", () => ({ default: () => () => ({ headers: new Map() }) }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

const { config } = await import("@/middleware");
const matches = (path) => unstable_doesMiddlewareMatch({ config, url: `https://mehamakor.co.il${path}` });

describe("middleware matcher — Sentry tunnel (MEH-2976)", () => {
  it("does not run on the tunnel path the SDK posts to", () => {
    expect(matches("/monitoring?o=4511240136228864&p=4511240163557376&r=us")).toBe(false);
  });

  it("control: still runs on ordinary pages", () => {
    expect(matches("/about")).toBe(true);
    expect(matches("/map")).toBe(true);
  });

  it("a business slug that only STARTS with monitoring still gets the middleware", () => {
    // as-needed locale prefix: /<slug> works only through the middleware rewrite.
    expect(matches("/monitoring-lab")).toBe(true);
    expect(matches("/monitoringx")).toBe(true);
  });

  it("next.config.js names the same tunnel path the matcher skips", () => {
    const src = readFileSync(join(__dirname, "..", "next.config.js"), "utf8");
    expect(src).toMatch(/tunnelRoute:\s*"\/monitoring"/);
  });
});
