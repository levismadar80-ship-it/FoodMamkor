/**
 * MEH-1234 — lib/places provider abstraction.
 *
 * Covers: provider dispatch (key present → Google, absent → Nominatim),
 * dedupe of identical rows (the "שרה" ×4 bug), Google autocomplete/details
 * mapping into the normalized Place shape, and session-token minting.
 * `fetch` is stubbed — no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hasGoogleKey,
  newSessionToken,
  autocompleteAddresses,
  resolveSuggestion,
  geocodeCity,
} from "@/lib/places";

const KEY = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function mockFetchOnce(payload, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok,
    json: async () => payload,
  });
}

describe("hasGoogleKey / newSessionToken", () => {
  it("hasGoogleKey reflects the env var at call time", () => {
    vi.stubEnv(KEY, "");
    expect(hasGoogleKey()).toBe(false);
    vi.stubEnv(KEY, "abc123");
    expect(hasGoogleKey()).toBe(true);
  });

  it("newSessionToken returns a non-empty string", () => {
    const t = newSessionToken();
    expect(typeof t).toBe("string");
    expect(t.length).toBeGreaterThan(0);
  });
});

describe("autocompleteAddresses — Nominatim fallback (no key)", () => {
  beforeEach(() => vi.stubEnv(KEY, ""));

  it("queries Nominatim (IL, he) and dedupes identical rows", async () => {
    // Four rows that render identically → the 'שרה ×4' bug. Expect 1 after dedupe.
    const dupRow = {
      place_id: 1,
      display_name: "שרה, רמת צבי - זכרון יעקב",
      address: { road: "שרה", suburb: "רמת צבי", city: "זכרון יעקב" },
      lat: "32.5",
      lon: "34.9",
    };
    const spy = mockFetchOnce([
      { ...dupRow, place_id: 1 },
      { ...dupRow, place_id: 2 },
      { ...dupRow, place_id: 3 },
      { ...dupRow, place_id: 4 },
    ]);

    const out = await autocompleteAddresses("שרה");
    const url = spy.mock.calls[0][0];
    expect(url).toContain("nominatim.openstreetmap.org");
    expect(url).toContain("countrycodes=il");
    expect(url).toContain("accept-language=he");
    // Deduped to one visible row.
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe("nominatim");
    expect(out[0].primary).toBe("שרה");
    expect(out[0].secondary).toBe("רמת צבי · זכרון יעקב");
  });

  it("resolveSuggestion returns the already-resolved Nominatim place (no network)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const suggestion = {
      provider: "nominatim",
      raw: { street: "שרה 3", city: "חיפה", lat: 32.8, lng: 35.0 },
    };
    const place = await resolveSuggestion(suggestion);
    expect(place).toEqual(suggestion.raw);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("autocompleteAddresses — Google Places (key present)", () => {
  beforeEach(() => vi.stubEnv(KEY, "test-key"));

  it("calls the Places autocomplete endpoint and maps structuredFormat", async () => {
    const spy = mockFetchOnce({
      suggestions: [
        {
          placePrediction: {
            placeId: "p1",
            structuredFormat: {
              mainText: { text: "דרך שרה 12" },
              secondaryText: { text: "זכרון יעקב" },
            },
          },
        },
        // Duplicate visible row → deduped away.
        {
          placePrediction: {
            placeId: "p2",
            structuredFormat: {
              mainText: { text: "דרך שרה 12" },
              secondaryText: { text: "זכרון יעקב" },
            },
          },
        },
      ],
    });

    const out = await autocompleteAddresses("דרך שרה", {
      sessionToken: "sess-1",
    });
    expect(spy.mock.calls[0][0]).toContain("places.googleapis.com");
    const init = spy.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.headers["X-Goog-Api-Key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.includedRegionCodes).toEqual(["il"]);
    expect(body.languageCode).toBe("he");
    expect(body.sessionToken).toBe("sess-1");
    // Deduped to one row, provider google.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      provider: "google",
      primary: "דרך שרה 12",
      secondary: "זכרון יעקב",
    });
  });

  it("resolveSuggestion issues a Place Details call and normalizes the Place", async () => {
    const spy = mockFetchOnce({
      formattedAddress: "דרך שרה 12, זכרון יעקב",
      location: { latitude: 32.57, longitude: 34.95 },
      addressComponents: [
        { types: ["route"], longText: "דרך שרה" },
        { types: ["street_number"], longText: "12" },
        { types: ["locality"], longText: "זכרון יעקב" },
        { types: ["postal_code"], longText: "3095000" },
      ],
    });

    const place = await resolveSuggestion(
      { provider: "google", raw: { placeId: "p1" } },
      { sessionToken: "sess-1" },
    );
    expect(spy.mock.calls[0][0]).toContain("/v1/places/p1");
    expect(spy.mock.calls[0][0]).toContain("sessionToken=sess-1");
    expect(place).toEqual({
      displayName: "דרך שרה 12, זכרון יעקב",
      street: "דרך שרה 12",
      neighborhood: "",
      city: "זכרון יעקב",
      postcode: "3095000",
      lat: 32.57,
      lng: 34.95,
    });
  });
});

/**
 * MEH-2014 PR 2 — geocodeCity.
 *
 * Added after the CI reviewer noticed that `MapManualOrigin.test.jsx` mocks the
 * whole `@/lib/places` module, so geocodeCity's OWN body — the empty-query
 * guard, the `Array.isArray` guard, the resolve step and the `Number.isFinite`
 * extraction — was never executed by any test. The QA harness exercises it in a
 * real browser, but only along the happy path with both providers route-mocked;
 * the null branches had no coverage at all.
 *
 * Driven through the Nominatim path (no key) so the two-step
 * autocomplete → resolve runs for real against a stubbed `fetch`.
 */
describe("geocodeCity (MEH-2014 PR 2)", () => {
  beforeEach(() => vi.stubEnv(KEY, ""));

  const row = (lat, lon) => [
    { place_id: 7, display_name: "חיפה, ישראל", lat, lon, address: { city: "חיפה" } },
  ];

  it("resolves a city name to {lat, lng}", async () => {
    mockFetchOnce(row("32.794", "34.9896"));
    await expect(geocodeCity("חיפה")).resolves.toEqual({ lat: 32.794, lng: 34.9896 });
  });

  it("returns null for an empty or whitespace query without calling the provider", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(geocodeCity("   ")).resolves.toBe(null);
    await expect(geocodeCity(null)).resolves.toBe(null);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null when the provider matches nothing", async () => {
    mockFetchOnce([]);
    await expect(geocodeCity("עיר שלא קיימת")).resolves.toBe(null);
  });

  it("returns null when the matched row carries no usable coordinates", async () => {
    // Nominatim omits lat/lon on some row types; `Number(undefined)` is NaN,
    // and NaN coordinates would sort every producer to Infinity distance.
    mockFetchOnce([{ place_id: 8, display_name: "חיפה", address: { city: "חיפה" } }]);
    await expect(geocodeCity("חיפה")).resolves.toBe(null);
  });

  it("re-throws a provider rejection instead of reporting a no-match", async () => {
    // MEH-1766: "provider said no" must stay distinguishable from "no such
    // city". The caller turns both into the same toast, but only after it can
    // tell them apart.
    mockFetchOnce({}, false);
    await expect(geocodeCity("חיפה")).rejects.toThrow(/rejected/i);
  });
});
