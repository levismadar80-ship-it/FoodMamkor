/**
 * MEH-435 — the CSP must let the browser reach the PostHog host that
 * lib/analytics.js sends to. Before this test, connect-src carried no PostHog
 * origin at all, so setting NEXT_PUBLIC_POSTHOG_KEY would have produced
 * blocked requests and zero events, with nothing in CI to say so.
 *
 * next.config.js cannot be require()d under the jsdom suite (see
 * SearchRouteRedirect.test.js), so both files are read as source.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (f) =>
  fs
    .readFileSync(path.join(process.cwd(), f), "utf-8")
    .replace(/^\s*\/\/.*$/gm, "");
const config = read("next.config.js");
const analytics = read("lib/analytics.js");

const directive = (name) => {
  const m = config.match(new RegExp("`" + name + " ([^`]*)`"));
  // Drop the ${vercelLive*} interpolation glued to the last source.
  return m ? m[1].replace(/\$\{[^}]*\}/g, "") : null;
};
const defaultHost = () => {
  const m = analytics.match(/NEXT_PUBLIC_POSTHOG_HOST\s*\|\|\s*"([^"]+)"/);
  return m ? m[1] : null;
};

describe("PostHog CSP (MEH-435)", () => {
  it("control: the reader finds the real directives and the default host", () => {
    expect(directive("connect-src")).toContain("https://*.ingest.sentry.io");
    expect(directive("script-src")).toContain("https://accounts.google.com");
    expect(defaultHost()).toMatch(/^https:\/\//);
  });

  it("the default host is PostHog's EU ingestion host, not the app host", () => {
    expect(defaultHost()).toBe("https://eu.i.posthog.com");
  });

  it("connect-src allows the default host", () => {
    expect(directive("connect-src").split(/\s+/)).toContain(defaultHost());
  });

  it("the EU assets host (config + lazy extensions) is allowed for fetch and script", () => {
    expect(directive("connect-src").split(/\s+/)).toContain(
      "https://eu-assets.i.posthog.com",
    );
    expect(directive("script-src").split(/\s+/)).toContain(
      "https://eu-assets.i.posthog.com",
    );
  });
});
