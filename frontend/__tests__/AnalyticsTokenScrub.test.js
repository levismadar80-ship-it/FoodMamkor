import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { scrubEvent } from "@/lib/analytics";

/**
 * MEH-2777 — no bearer token reaches PostHog.
 *
 * Two credentials on this site live in a URL PATH: /claim/<jwt> (MEH-2321)
 * and /registration/<token> (MEH-2768). Whoever holds either can act with it.
 *
 * WHY A GUARD AND NOT JUST THE CONFIG. `autocapture: false` +
 * `capture_pageview: false` suppress automatic EVENTS; they do not touch the
 * `$current_url` / `$pathname` PROPERTIES, which posthog attaches to every
 * capture from `location.href`. Before this change nothing leaked only because
 * every trackEvent() call site happens to sit on another route — an accident,
 * not a property. The last describe block re-derives the posthog half from
 * node_modules so the claim cannot rot into a comment nobody rechecks.
 *
 * DISCRIMINATION — each case fails against a plausible wrong implementation:
 *   - drop `before_send` from the init          → "the init wires before_send"
 *   - use the deprecated `sanitize_properties`  → "does not use the deprecated"
 *   - scrub `properties` only, not `$set`       → "nested person properties"
 *   - scrub `$current_url` only                 → "$pathname too"
 *   - return `{}` / null from the hook          → "a boring event is untouched"
 *                                                 + "null survives"
 * The first is run as a live mutation in the PR body, per MEH-1619.
 */

const ROOT = path.resolve(__dirname, "..");
const ANALYTICS_SRC = readFileSync(path.join(ROOT, "lib/analytics.js"), "utf8");

// Shaped like a real sign-up cancel token — secrets.token_urlsafe(32) is 43
// url-safe chars, and claim-token.js matches on `[\w-]{40,}`, so the length is
// load-bearing and a short stand-in would not exercise the regex at all.
// Spelled as an obvious placeholder because scripts/checks/secrets-scan-guard.sh
// flags a 43-char opaque literal as a possible credential, and making it
// self-evidently fake is the remedy it asks for (not an exemption).
const REG_TOKEN = "EXAMPLE-not-a-real-token-0000000000000000000";
// A real claim token is a compact JWT, matched on its "eyJ" header.
const CLAIM_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

/** The shape posthog hands `before_send` (CaptureResult, @posthog/types). */
function captureResult(url, extra = {}) {
  return {
    uuid: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
    event: "probe_event",
    properties: {
      $current_url: `https://mehamakor.co.il${url}`,
      $pathname: url,
      $host: "mehamakor.co.il",
      ...extra,
    },
    timestamp: new Date("2026-11-07T10:00:00Z"),
  };
}

describe("control — the scrubber is alive and discriminating", () => {
  // Runs first on purpose. If a token-bearing event comes back unchanged the
  // hook is a no-op and every expectation below is void, not reassuring: a
  // `scrubClaimTokens` that bailed on the CaptureResult's prototype would
  // return the object untouched and raise nothing.
  it("redacts a known-leaky event (if this fails, the whole file is void)", () => {
    const out = scrubEvent(captureResult(`/he/registration/${REG_TOKEN}`));
    expect(out.properties.$current_url).not.toContain(REG_TOKEN);
    expect(out.properties.$current_url).toBe(
      "https://mehamakor.co.il/he/registration/[token]",
    );
  });

  it("leaves a boring event byte-identical", () => {
    // The inverse control: a scrubber that blanked everything would pass the
    // case above and be useless. This pins that it only touches tokens.
    const before = captureResult("/he/producers?city=%D7%97%D7%99%D7%A4%D7%94");
    const url = before.properties.$current_url;
    const out = scrubEvent(before);
    expect(out.properties.$current_url).toBe(url);
    expect(out.properties.$host).toBe("mehamakor.co.il");
    expect(out.event).toBe("probe_event");
  });
});

describe("every property posthog builds from location.href", () => {
  it("$pathname too, not only $current_url", () => {
    const out = scrubEvent(captureResult(`/registration/${REG_TOKEN}`));
    expect(out.properties.$pathname).toBe("/registration/[token]");
  });

  it("the claim JWT, the site's other path credential", () => {
    const out = scrubEvent(captureResult(`/he/claim/${CLAIM_JWT}`));
    expect(out.properties.$current_url).toBe("https://mehamakor.co.il/he/claim/[token]");
    expect(out.properties.$pathname).toBe("/he/claim/[token]");
  });

  it("nested person properties under $set and $set_once", () => {
    // posthog copies the first-seen URL into person props; scrubbing
    // `properties` alone would ship the token on the person record instead.
    const event = captureResult("/he", {
      $initial_current_url: `https://mehamakor.co.il/he/registration/${REG_TOKEN}`,
    });
    event.$set = { $current_url: `https://mehamakor.co.il/he/claim/${CLAIM_JWT}` };
    event.$set_once = {
      $initial_pathname: `/he/registration/${REG_TOKEN}`,
    };

    const out = scrubEvent(event);
    const flat = JSON.stringify(out);
    expect(flat).not.toContain(REG_TOKEN);
    expect(flat).not.toContain(CLAIM_JWT);
    expect(out.$set.$current_url).toBe("https://mehamakor.co.il/he/claim/[token]");
    expect(out.$set_once.$initial_pathname).toBe("/he/registration/[token]");
  });

  it("a percent-encoded token in a ?redirect= is redacted", () => {
    const out = scrubEvent(
      captureResult(`/he/login?redirect=%2Fhe%2Fregistration%2F${REG_TOKEN}`),
    );
    expect(out.properties.$current_url).not.toContain(REG_TOKEN);
  });
});

describe("the BeforeSendFn contract", () => {
  it("null survives — the hook redacts, it never drops an event", () => {
    // Returning anything falsy for a null input is the same as returning null,
    // but returning null for a REAL event would silently stop analytics.
    expect(scrubEvent(null)).toBeNull();
    const event = captureResult("/he");
    expect(scrubEvent(event)).not.toBeNull();
  });

  it("the Date timestamp is not mangled into a string", () => {
    const out = scrubEvent(captureResult("/he"));
    expect(out.timestamp).toBeInstanceOf(Date);
  });
});

describe("the init actually wires it", () => {
  it("passes before_send", () => {
    // The hook can be perfect and unreachable. This is the only assertion
    // that fails if someone deletes the one line in posthog.init().
    expect(ANALYTICS_SRC).toMatch(/before_send:\s*scrubEvent/);
  });

  it("does not use the deprecated sanitize_properties", () => {
    // Matches an ASSIGNMENT, not the token. A bare /sanitize_properties/ also
    // hits the JSDoc above scrubEvent, which names the option to say why it is
    // the wrong one — so the first version of this assertion failed on its own
    // documentation. Same shape as scripts/checks/raw-color-tokens.sh counting
    // comment prose. The narrower pattern still reds the real mistake:
    // `sanitize_properties: scrubEvent` in the init.
    expect(ANALYTICS_SRC).not.toMatch(/sanitize_properties\s*:/);
  });
});

describe("re-derived from node_modules — the posthog behaviour this relies on", () => {
  // .claude/rules/frontend.md: a claim about a dependency needs a test that
  // re-derives it from node_modules, not a sentence in a comment. All three
  // claims below are load-bearing for the guard above; if posthog changes any
  // of them this reds and the reasoning gets re-read instead of rotting.
  const EVENT_UTILS = path.join(
    ROOT,
    "node_modules/@posthog/browser-common/dist/utils/event-utils.mjs",
  );
  const CONFIG_TYPES = path.join(
    ROOT,
    "node_modules/@posthog/types/dist/posthog-config.d.ts",
  );

  it("getEventProperties still sets $current_url and $pathname from location", () => {
    const src = readFileSync(EVENT_UTILS, "utf8");
    const fn = src.slice(src.indexOf("function getEventProperties"));
    expect(fn, "getEventProperties not found").toBeTruthy();
    const body = fn.slice(0, fn.indexOf("\n}\n") + 1);
    expect(body).toMatch(/\$current_url:/);
    expect(body).toMatch(/\$pathname:/);
    // Control: the slice really is a bounded function body, not the whole
    // file — otherwise the two matches above prove nothing about WHERE.
    expect(body.length).toBeGreaterThan(200);
    expect(body.length).toBeLessThan(src.length / 2);
  });

  it("before_send is still a supported config option", () => {
    expect(readFileSync(CONFIG_TYPES, "utf8")).toMatch(
      /before_send\?:\s*BeforeSendFn/,
    );
  });

  it("sanitize_properties is still the deprecated one", () => {
    const src = readFileSync(CONFIG_TYPES, "utf8");
    const at = src.indexOf("sanitize_properties");
    expect(at).toBeGreaterThan(-1);
    // The @deprecated tag sits on the line above the declaration.
    expect(src.slice(Math.max(0, at - 200), at)).toContain("@deprecated");
  });
});
