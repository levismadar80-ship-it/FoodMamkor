/**
 * MEH-2324 — the claim token's redaction is wired into every reporter.
 *
 * claimToken.test.js proves scrubClaimTokens works; this proves each reporter
 * actually calls it. The token is a bearer credential in /claim/<token>, so a
 * dropped beforeSend line or a reverted layout swap would ship it to Sentry or
 * Vercel with every other test still green.
 * DISCRIMINATION: delete any beforeSend / beforeSendTransaction line, or render
 * the bare <SpeedInsights /> in the layout, and the matching case fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";

const init = vi.fn();
vi.mock("@sentry/nextjs", () => ({ init: (...args) => init(...args), replayIntegration: () => ({}) }));

let speedInsightsProps;
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: (props) => {
    speedInsightsProps = props;
    return null;
  },
}));

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwLTEifQ.s1g-_x";
const event = () => ({
  request: { url: `https://mehamakor.co.il/claim/${TOKEN}` },
  transaction: `/claim/${TOKEN}`,
});

describe("Sentry configs redact the claim token", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    init.mockClear();
    process.env.SENTRY_DSN = "https://k@o.ingest.sentry.io/1";
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://k@o.ingest.sentry.io/1";
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it.each([["server"], ["edge"], ["client"]])("sentry.%s.config", async (name) => {
    await import(`../sentry.${name}.config.js`);
    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0];
    for (const hook of ["beforeSend", "beforeSendTransaction"]) {
      expect(typeof options[hook], hook).toBe("function");
      expect(JSON.stringify(options[hook](event(), {})), hook).not.toContain(TOKEN);
    }
  });
});

describe("Speed Insights redacts the claim token", () => {
  it("SpeedInsightsRedacted passes a redacting beforeSend", async () => {
    const { default: SpeedInsightsRedacted } = await import("@/components/SpeedInsightsRedacted");
    render(<SpeedInsightsRedacted />);
    const out = speedInsightsProps.beforeSend({ type: "vital", url: `https://mehamakor.co.il/claim/${TOKEN}` });
    expect(out.url).toBe("https://mehamakor.co.il/claim/[token]");
  });

  // The layout is an async server component, so this one reads its source:
  // it must render the redacting wrapper and never the bare reporter.
  it("the locale layout renders the wrapper, not the bare component", () => {
    const layout = readFileSync(path.join(path.resolve(__dirname, ".."), "app/[locale]/layout.js"), "utf8");
    expect(layout).toMatch(/<SpeedInsightsRedacted\s*\/>/);
    expect(layout).not.toMatch(/<SpeedInsights[\s/>]/);
    expect(layout).not.toMatch(/from "@vercel\/speed-insights\/next"/);
  });
});
