import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// MEH-2536: Next 16 builds with Turbopack, and @sentry/nextjs only injects
// sentry.client.config.js through webpack — so the browser SDK never started
// and the javascript-nextjs project held CSP reports and server errors only.
// The browser init must live in instrumentation-client.js, which Next itself
// runs on the client under either bundler.
const root = path.resolve(__dirname, "..");
const read = (f) => readFileSync(path.join(root, f), "utf8");

describe("browser Sentry init file (MEH-2536)", () => {
  it("lives in instrumentation-client.js and calls Sentry.init", () => {
    expect(existsSync(path.join(root, "instrumentation-client.js"))).toBe(true);
    expect(read("instrumentation-client.js")).toMatch(/Sentry\.init\(/);
  });

  it("keeps the claim-token scrub (MEH-2324) on errors and transactions", () => {
    const src = read("instrumentation-client.js");
    expect(src).toMatch(/import \{ scrubClaimTokens \} from "\.\/lib\/claim-token"/);
    expect(src).toMatch(/beforeSend\(event\)[\s\S]*scrubClaimTokens\(event\)/);
    expect(src).toMatch(/beforeSendTransaction: \(event\) => scrubClaimTokens\(event\)/);
  });

  it("exports the App Router navigation hook", () => {
    expect(read("instrumentation-client.js")).toMatch(
      /export const onRouterTransitionStart = Sentry\.captureRouterTransitionStart/,
    );
  });

  it("no webpack-only sentry.client.config.* is left to be mistaken for the live one", () => {
    for (const f of ["sentry.client.config.js", "sentry.client.config.ts"]) {
      expect(existsSync(path.join(root, f))).toBe(false);
    }
  });
});
