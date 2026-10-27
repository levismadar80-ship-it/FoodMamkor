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
    // auth-context builds /login?redirect= with encodeURIComponent(pathname).
    [`/login?redirect=%2Fclaim%2F${TOKEN}`, "/login?redirect=%2Fclaim%2F[token]"],
    [`/login?redirect=%2Fen%2Fclaim%2f${TOKEN}&x=1`, "/login?redirect=%2Fen%2Fclaim%2F[token]&x=1"],
  ])("%s", (input, expected) => {
    expect(redactClaimPath(input)).toBe(expected);
  });

  it("leaves token-less paths alone", () => {
    expect(redactClaimPath("/claim")).toBe("/claim");
    expect(redactClaimPath("/producer/dashboard")).toBe("/producer/dashboard");
  });

  // Sentry stack frames carry the route's chunk URL. Rewriting its %5Btoken%5D
  // segment would break the frame's link to the served file.
  it.each([
    "https://mehamakor.co.il/_next/static/chunks/app/%5Blocale%5D/claim/%5Btoken%5D/page-0a1b2c3d.js",
    "https://mehamakor.co.il/_next/static/chunks/app/%5Blocale%5D/claim/page-0a1b2c3d.js",
    "https://mehamakor.co.il/_next/static/chunks/app/%5Blocale%5D/claim/page-0a1b2c3d.js.map",
    "webpack://_N_E/./app/[locale]/claim/ClaimClient.jsx",
    "/login?redirect=%2Fclaim%2Fpage-0a1b2c3d.js",
  ])("leaves a route file URL alone: %s", (url) => {
    expect(redactClaimPath(url)).toBe(url);
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

  // A server event carries Sentry's own objects (Scope instances under
  // sdkProcessingMetadata) and can carry Buffers or frozen data. A throw here
  // would drop every server error, not only claim ones.
  it("does not walk or write non-plain objects, frozen data or getters", () => {
    class Scope {
      constructor() {
        this.note = `/claim/${TOKEN}`;
      }
    }
    const scope = new Scope();
    const frozen = Object.freeze({ url: "/about" });
    const withGetter = Object.defineProperty({}, "url", { get: () => "/about", enumerable: true });
    const throwingGetter = Object.defineProperty({}, "url", {
      get: () => {
        throw new Error("boom");
      },
      enumerable: true,
    });
    const event = {
      request: { url: `/claim/${TOKEN}` },
      sdkProcessingMetadata: { capturedSpanScope: scope, normalizedRequest: { url: `/claim/${TOKEN}` } },
      extra: { buf: Buffer.from("x"), frozen, withGetter, throwingGetter },
    };
    expect(() => scrubClaimTokens(event)).not.toThrow();
    expect(event.request.url).toBe("/claim/[token]");
    // Sentry's internals are left as they are; they are stripped before send.
    expect(scope.note).toBe(`/claim/${TOKEN}`);
    expect(event.sdkProcessingMetadata.normalizedRequest.url).toBe(`/claim/${TOKEN}`);
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
