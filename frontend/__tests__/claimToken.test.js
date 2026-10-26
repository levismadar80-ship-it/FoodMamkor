/**
 * MEH-2324 — the claim link is a bearer credential in its path. These pin the
 * redaction that keeps it out of Sentry and Speed Insights, and the storage
 * fallback the claim page relies on.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearClaimToken,
  readClaimToken,
  redactClaimPath,
  scrubClaimTokens,
  stashClaimToken,
} from "@/lib/claim-token";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwLTEifQ.s1g-_x";

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("redactClaimPath", () => {
  it.each([
    [`https://mehamakor.co.il/claim/${TOKEN}`, "https://mehamakor.co.il/claim/[token]"],
    [`/en/claim/${TOKEN}?utm=x#top`, "/en/claim/[token]?utm=x#top"],
    [`navigated from /claim/${TOKEN} to /claim`, "navigated from /claim/[token] to /claim"],
  ])("%s", (input, expected) => {
    expect(redactClaimPath(input)).toBe(expected);
  });

  it("leaves token-less paths alone", () => {
    expect(redactClaimPath("/claim")).toBe("/claim");
    expect(redactClaimPath("/producer/dashboard")).toBe("/producer/dashboard");
  });
});

describe("scrubClaimTokens", () => {
  it("redacts every string in a Sentry-shaped event, nested in arrays and objects", () => {
    const event = {
      request: { url: `https://mehamakor.co.il/claim/${TOKEN}` },
      transaction: `/claim/${TOKEN}`,
      breadcrumbs: [{ category: "navigation", data: { from: `/claim/${TOKEN}`, to: "/claim" } }],
      extra: { count: 3, ok: true, nothing: null },
    };
    const out = JSON.stringify(scrubClaimTokens(event));
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('"from":"/claim/[token]"');
    expect(out).toContain('"count":3');
  });

  it("survives a cyclic object", () => {
    const cyclic = { a: `/claim/${TOKEN}` };
    cyclic.self = cyclic;
    expect(() => scrubClaimTokens(cyclic)).not.toThrow();
    expect(cyclic.a).toBe("/claim/[token]");
  });

  it("redacts a token however deep it sits", () => {
    let deep = { url: `/claim/${TOKEN}` };
    for (let i = 0; i < 20; i += 1) deep = { child: deep };
    expect(JSON.stringify(scrubClaimTokens(deep))).not.toContain(TOKEN);
  });

  it("redacts a token in an object reached twice", () => {
    const shared = { url: `/claim/${TOKEN}` };
    const out = scrubClaimTokens({ a: shared, b: [shared] });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });
});

describe("storage", () => {
  it("round-trips and clears", () => {
    expect(stashClaimToken(TOKEN)).toBe(true);
    expect(readClaimToken()).toBe(TOKEN);
    clearClaimToken();
    expect(readClaimToken()).toBeNull();
  });

  it("reports failure when storage refuses, so the page keeps the token in memory", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(stashClaimToken(TOKEN)).toBe(false);
  });
});
