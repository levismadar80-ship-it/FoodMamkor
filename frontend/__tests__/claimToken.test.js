/**
 * MEH-2324 — the claim link is a bearer credential in its path. These pin the
 * redaction that keeps it out of Sentry and Speed Insights, and the storage
 * fallback the claim page relies on.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearClaimToken,
  clearOwnerInviteToken,
  readClaimToken,
  readOwnerInviteToken,
  redactClaimPath,
  scrubClaimTokens,
  stashClaimToken,
  stashOwnerInviteToken,
} from "@/lib/claim-token";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwLTEifQ.s1g-_x";
// MEH-2974: the SHAPE of a `secrets.token_urlsafe(32)` — 43 url-safe
// characters, no dot. Spelled with "example" so secrets-scan-guard.sh reads it
// as the placeholder it is; what the redaction tests exercise is the length
// and the character class, never a particular value.
const INVITE_TOKEN = "example-token-nn2lsMmYGRO8vlYIdErxoU8xxxxxxx";

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

  // MEH-2768: the sign-up cancel link, page and API.
  const REG = "Xb3_kQ9-vR2mN7pL4sT8wY1zA6cE5fH0jK3nP9qU2xV";
  it.each([
    [`https://mehamakor.co.il/registration/${REG}`, "https://mehamakor.co.il/registration/[token]"],
    [`/en/registration/${REG}?x=1`, "/en/registration/[token]?x=1"],
    [`GET https://api.example/registrations/${REG}`, "GET https://api.example/registrations/[token]"],
    [`POST /registrations/${REG}/cancel`, "POST /registrations/[token]/cancel"],
    [`/login?redirect=%2Fregistration%2F${REG}`, "/login?redirect=%2Fregistration%2F[token]"],
  ])("cancel link: %s", (input, expected) => {
    expect(redactClaimPath(input)).toBe(expected);
  });

  it.each([
    "webpack://_N_E/./app/[locale]/registration/[token]/CancelRegistrationClient.jsx",
    "https://mehamakor.co.il/_next/static/chunks/app/%5Blocale%5D/registration/%5Btoken%5D/page-0a1b2c3d.js",
    "/events/11111111-0000-0000-0000-000000000001/registrations",
  ])("leaves a registration route file / list URL alone: %s", (url) => {
    expect(redactClaimPath(url)).toBe(url);
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

/**
 * MEH-2974 — the owner-invite link is a bearer credential in its path too, and
 * a stronger one: it hands over a LIVE business page. Same redaction, same
 * storage contract, separate key.
 */
describe("owner-invite redaction", () => {
  it.each([
    [
      `https://mehamakor.co.il/owner-invite/${INVITE_TOKEN}`,
      "https://mehamakor.co.il/owner-invite/[token]",
    ],
    [`/he/owner-invite/${INVITE_TOKEN}?utm=x#top`, "/he/owner-invite/[token]?utm=x#top"],
    [
      `navigated from /owner-invite/${INVITE_TOKEN} to /owner-invite`,
      "navigated from /owner-invite/[token] to /owner-invite",
    ],
    [
      `/login?redirect=%2Fowner-invite%2F${INVITE_TOKEN}`,
      "/login?redirect=%2Fowner-invite%2F[token]",
    ],
    [
      `/login?redirect=%2Fhe%2Fowner-invite%2f${INVITE_TOKEN}&x=1`,
      "/login?redirect=%2Fhe%2Fowner-invite%2F[token]&x=1",
    ],
  ])("%s", (input, expected) => {
    expect(redactClaimPath(input)).toBe(expected);
  });

  it("leaves the route's own build artifacts alone", () => {
    // The 40-character floor is what keeps stack frames pointing at their
    // source. A redactor that swallowed these would make every Sentry frame
    // from this route unattributable — which is the cost the floor buys.
    for (const frame of [
      "/_next/static/chunks/app/[locale]/owner-invite/[token]/page-8f21c0.js",
      "/owner-invite/OwnerInviteClient.jsx",
      "/owner-invite/page.js",
    ]) {
      expect(redactClaimPath(frame)).toBe(frame);
    }
  });

  it("scrubs a nested telemetry payload", () => {
    const event = {
      request: { url: `/he/owner-invite/${INVITE_TOKEN}` },
      breadcrumbs: [{ data: { to: `/owner-invite/${INVITE_TOKEN}` } }],
    };
    scrubClaimTokens(event);
    expect(event.request.url).toBe("/he/owner-invite/[token]");
    expect(event.breadcrumbs[0].data.to).toBe("/owner-invite/[token]");
    expect(JSON.stringify(event)).not.toContain(INVITE_TOKEN);
  });
});

describe("owner-invite storage", () => {
  it("round-trips and clears", () => {
    expect(stashOwnerInviteToken(INVITE_TOKEN)).toBe(true);
    expect(readOwnerInviteToken()).toBe(INVITE_TOKEN);
    clearOwnerInviteToken();
    expect(readOwnerInviteToken()).toBeNull();
  });

  it("keeps its own key, so the two flows cannot overwrite each other", () => {
    // Both can legitimately be open in one tab — an admin testing an invite
    // while holding a claim link — and one clobbering the other would send the
    // wrong credential to the wrong endpoint.
    stashClaimToken(TOKEN);
    stashOwnerInviteToken(INVITE_TOKEN);
    expect(readClaimToken()).toBe(TOKEN);
    expect(readOwnerInviteToken()).toBe(INVITE_TOKEN);
    clearOwnerInviteToken();
    expect(readClaimToken()).toBe(TOKEN);
  });
});
