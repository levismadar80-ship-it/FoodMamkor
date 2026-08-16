import { describe, it, expect } from "vitest";
import { withReferralParams } from "../lib/utils.js";

// MEH-1525 — referral-attribution helper for a business's own outbound
// website URL. The ticket named the path frontend/lib/__tests__/, but vitest's
// include glob is "__tests__/**/*.test.{js,jsx,ts,tsx}" (vitest.config.js:41),
// so a test under lib/__tests__/ would silently never run in the required
// "Frontend unit tests (vitest)" gate — exactly the silent-coverage-gap class
// MEH-1030 guards against. Placed here so the gate actually executes it.

const P = "utm_source=mehamakor";
const M = "utm_medium=referral";

describe("withReferralParams (MEH-1525)", () => {
  it("appends both params to a plain https URL", () => {
    const out = withReferralParams("https://example.com");
    expect(out).toContain(P);
    expect(out).toContain(M);
    expect(out).toBe(
      "https://example.com/?utm_source=mehamakor&utm_medium=referral",
    );
  });

  it("preserves an existing query param and appends the referral params", () => {
    const out = withReferralParams("https://example.com/?a=1");
    expect(out).toContain("a=1");
    expect(out).toContain(P);
    expect(out).toContain(M);
  });

  it("keeps the hash fragment and places params before it", () => {
    const out = withReferralParams("https://example.com/#section");
    expect(out).toBe(
      "https://example.com/?utm_source=mehamakor&utm_medium=referral#section",
    );
    // params sit before the hash, hash survives
    expect(out.indexOf(P)).toBeLessThan(out.indexOf("#section"));
    expect(out.endsWith("#section")).toBe(true);
  });

  it("prepends https:// to a scheme-less URL then appends params", () => {
    const out = withReferralParams("example.com");
    expect(out).toBe(
      "https://example.com/?utm_source=mehamakor&utm_medium=referral",
    );
  });

  it("returns the URL UNCHANGED when utm_source is already present", () => {
    const raw = "https://example.com/?utm_source=fb";
    expect(withReferralParams(raw)).toBe(raw);
  });

  it("returns a non-URL string UNCHANGED without throwing", () => {
    const raw = "not a url at all";
    expect(() => withReferralParams(raw)).not.toThrow();
    expect(withReferralParams(raw)).toBe(raw);
  });

  it("returns an empty string UNCHANGED without throwing", () => {
    expect(() => withReferralParams("")).not.toThrow();
    expect(withReferralParams("")).toBe("");
  });

  it("does not throw on null / undefined", () => {
    expect(() => withReferralParams(null)).not.toThrow();
    expect(() => withReferralParams(undefined)).not.toThrow();
    expect(withReferralParams(null)).toBe(null);
    expect(withReferralParams(undefined)).toBe(undefined);
  });
});
