/**
 * MEH-3403 — the WhatsApp preview of a «עמוד מוכן» claim link.
 *
 * A token that still works → the preview names the business and shows its
 * main photo. Expired / revoked / unreadable / backend down → the generic card
 * of before. In every case the token is written into no metadata field, and
 * the page stays noindex.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

const MESSAGES = { he, en };
const fetchMock = vi.fn();
// The backend-down case: serverFetch itself rejects (a timeout, a refused
// connection), inside claimMetadata's try.
let backendDown = false;

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }) =>
    createTranslator({ locale, messages: MESSAGES[locale], namespace }),
}));
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: async (...args) => {
    if (backendDown) throw new Error("fetch failed");
    return fetchMock(...args);
  },
}));

const { claimMetadata } = await import("@/app/[locale]/claim/claim-metadata");

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.secret-claim-token.sig";
const CLOUD = "https://res.cloudinary.com/demo/image/upload/v1/bakery.jpg";

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  backendDown = false;
});

describe("claimMetadata (MEH-3403)", () => {
  it("names the business and shows its photo for a working token", async () => {
    fetchMock.mockReturnValue(ok({ name: "מאפיית הבוקר", image: CLOUD }));
    const m = await claimMetadata(Promise.resolve({ locale: "he", token: TOKEN }));
    expect(m.title).toEqual({ absolute: "העמוד של מאפיית הבוקר במהמקור" });
    expect(m.openGraph.title).toBe("העמוד של מאפיית הבוקר במהמקור");
    expect(m.openGraph.description).toBe(he.seo.claim.description);
    expect(m.openGraph.images[0].url).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_1200,h_630,c_fill,f_auto,q_auto/v1/bakery.jpg",
    );
    expect(m.robots).toEqual({ index: false, follow: false });
    // the token travels in the POST body, never in the URL
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/producer-claim\/preview$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
  });

  it("uses the English title on /en", async () => {
    fetchMock.mockReturnValue(ok({ name: "Morning Bakery", image: null }));
    const m = await claimMetadata(Promise.resolve({ locale: "en", token: TOKEN }));
    expect(m.openGraph.title).toBe("Morning Bakery's page on Mehamakor");
  });

  it("falls back to the site image when the business has no photo", async () => {
    fetchMock.mockReturnValue(ok({ name: "מאפיית הבוקר", image: null }));
    const m = await claimMetadata(Promise.resolve({ locale: "he", token: TOKEN }));
    expect(m.openGraph.images[0].url).toBe("/og-image.png");
    expect(m.twitter.images).toEqual(["/og-image.png"]);
  });

  it.each([
    ["an expired or revoked token (404)", () => ({ ok: false, status: 404, json: async () => ({}) })],
    ["a claimed draft (409)", () => ({ ok: false, status: 409, json: async () => ({}) })],
    ["an empty name", () => ok({ name: "  ", image: CLOUD })],
  ])("keeps the generic card for %s", async (_label, respond) => {
    fetchMock.mockImplementation(respond);
    const m = await claimMetadata(Promise.resolve({ locale: "he", token: TOKEN }));
    expect(m.title).toBe(he.seo.claim.title);
    expect(m.description).toBe(he.seo.claim.description);
    expect(m.openGraph).toBeUndefined();
  });

  it("keeps the generic card when the backend is down", async () => {
    backendDown = true;
    const m = await claimMetadata(Promise.resolve({ locale: "he", token: TOKEN }));
    expect(m.title).toBe(he.seo.claim.title);
    expect(m.openGraph).toBeUndefined();
  });

  it("does not call the backend on /claim (no token)", async () => {
    const m = await claimMetadata(Promise.resolve({ locale: "he" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.title).toBe(he.seo.claim.title);
  });

  it("writes the token into no metadata field", async () => {
    fetchMock.mockReturnValue(ok({ name: "מאפיית הבוקר", image: CLOUD }));
    const m = await claimMetadata(Promise.resolve({ locale: "he", token: TOKEN }));
    expect(JSON.stringify(m)).not.toContain("secret-claim-token");
    expect(m.openGraph.url).toBeUndefined();
    expect(m.alternates).toBeUndefined();
  });
});
