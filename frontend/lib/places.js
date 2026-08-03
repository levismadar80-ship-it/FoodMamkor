/**
 * Module:   places
 * Purpose:  Address-autocomplete provider abstraction for AddressSearch
 *           (MEH-1234). Two backends behind one normalized shape so the
 *           component stays provider-agnostic:
 *             • Google Places API (New), REST — when
 *               NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. IL-restricted, Hebrew,
 *               session-token'd (autocomplete + one details call bill as one
 *               session). No Maps JS SDK — plain fetch keeps the bundle small.
 *             • Nominatim (OpenStreetMap) — the pre-MEH-1234 fallback, unchanged
 *               behavior, used when the key is absent so the app is fully
 *               functional (and the PR mergeable) without Google.
 * Touches:  Google Places API + OSM Nominatim over fetch. No app backend.
 * Does NOT: render anything or manage the session token lifecycle — that lives
 *           in components/AddressSearch.jsx (mints per autocomplete session,
 *           consumes on select).
 * Related:  components/AddressSearch.jsx (sole consumer).
 * History:  MEH-1234 (creation — Wolt-style Google Places + Nominatim fallback);
 *           MEH-1766 (throw ProviderError on a rejected lookup instead of
 *           returning [] — "provider said no" and "no such address" were
 *           indistinguishable, so a disabled API key looked like a real
 *           zero-result search on every surface).
 *
 * Suggestion = { id, primary, secondary, provider, raw }.
 * Place      = { street, neighborhood, city, postcode, lat, lng, displayName }.
 */

/**
 * A lookup the provider actively rejected (HTTP non-2xx) — as opposed to a
 * successful lookup that legitimately matched nothing.
 *
 * MEH-1766: both cases used to `return []`, which is why a Places API (New)
 * key that is present but not enabled for the endpoint (403 PERMISSION_DENIED)
 * renders exactly like "דרך שרה matched nothing". The caller needs to tell
 * them apart to log something actionable.
 */
export class ProviderError extends Error {
  constructor(provider, status, detail) {
    super(`${provider} address lookup rejected (HTTP ${status})`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.detail = detail;
  }
}

/** Read a failed response's body for the log line, never throwing itself. */
async function rejectionDetail(res) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

// Read the NEXT_PUBLIC_* literal at call time (not module load) so Next inlines
// it in the browser bundle AND vitest can toggle it via vi.stubEnv.
function googleKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
}

export function hasGoogleKey() {
  return Boolean(googleKey());
}

/** Fresh Places session token — groups an autocomplete session + its one
 *  details call into a single billable unit (Google cost control). */
export function newSessionToken() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Non-crypto fallback (older browsers / test envs) — uniqueness is enough.
  return `sess-${Math.random().toString(36).slice(2)}${Math.random()
    .toString(36)
    .slice(2)}`;
}

// Collapse rows that render identically (same primary + secondary) — fixes the
// "שרה, רמת צבי - זכרון יעקב" ×4 duplicate bug for BOTH providers (MEH-1234).
function dedupeSuggestions(suggestions) {
  const seen = new Set();
  const out = [];
  for (const s of suggestions) {
    const key = `${s.primary}||${s.secondary}`.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// --- Nominatim (fallback) ----------------------------------------------------

/** Pull the fields we care about out of a Nominatim row (fully resolved). */
function normalizeNominatim(r) {
  const a = r.address || {};
  // Nominatim's "city" lands in any of these depending on place type.
  const city = a.city || a.town || a.village || a.municipality || a.county || "";
  const neighborhood =
    a.neighbourhood || a.suburb || a.quarter || a.city_district || "";
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  return {
    displayName: r.display_name || "",
    street,
    neighborhood,
    city,
    postcode: a.postcode || "",
    lat: r.lat ? Number(r.lat) : null,
    lng: r.lon ? Number(r.lon) : null,
  };
}

async function nominatimAutocomplete(query, { signal } = {}) {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?q=${encodeURIComponent(query)}` +
    "&countrycodes=il" +
    "&format=json" +
    "&addressdetails=1" +
    "&accept-language=he" +
    "&limit=6";
  const res = await fetch(url, {
    // Browsers strip/normalise User-Agent and Referer; Accept-Language is the
    // one identification handle we have (usage-policy note, pre-MEH-1234).
    headers: { "Accept-Language": "he,en;q=0.8" },
    signal,
  });
  // MEH-1766: reject loudly. An empty array here means "matched nothing".
  if (!res.ok) {
    throw new ProviderError("nominatim", res.status, await rejectionDetail(res));
  }
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  const suggestions = rows.map((r, idx) => {
    const p = normalizeNominatim(r);
    return {
      id: r.place_id ?? `nom-${idx}`,
      primary: p.street || (p.displayName.split(",")[0] || ""),
      secondary: [p.neighborhood, p.city].filter(Boolean).join(" · "),
      provider: "nominatim",
      // Nominatim rows arrive fully resolved — no details call needed.
      raw: p,
    };
  });
  return dedupeSuggestions(suggestions);
}

// --- Google Places API (New) -------------------------------------------------

async function googleAutocomplete(query, { signal, sessionToken } = {}) {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey(),
      },
      signal,
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["il"],
        languageCode: "he",
        ...(sessionToken ? { sessionToken } : {}),
      }),
    },
  );
  // MEH-1766: a present-but-unauthorized key (Places API (New) not enabled on
  // the project, or an HTTP-referrer restriction that misses the deployment
  // domain) answers 403 here. Returning [] made that indistinguishable from a
  // genuine no-match — throw so the caller can log which one it was.
  if (!res.ok) {
    throw new ProviderError("google", res.status, await rejectionDetail(res));
  }
  const data = await res.json();
  const preds = (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean);
  const suggestions = preds.map((p, idx) => {
    const fmt = p.structuredFormat || {};
    return {
      id: p.placeId || `g-${idx}`,
      primary: fmt.mainText?.text || p.text?.text || "",
      secondary: fmt.secondaryText?.text || "",
      provider: "google",
      raw: { placeId: p.placeId },
    };
  });
  return dedupeSuggestions(suggestions);
}

/** Map a Google Place Details response → our normalized Place shape. */
function normalizeGoogleDetails(place) {
  const comps = place.addressComponents || [];
  const get = (type) => {
    const c = comps.find((x) => (x.types || []).includes(type));
    return c ? c.longText || c.shortText || "" : "";
  };
  const street = [get("route"), get("street_number")].filter(Boolean).join(" ");
  const city =
    get("locality") ||
    get("postal_town") ||
    get("administrative_area_level_2") ||
    "";
  const neighborhood =
    get("neighborhood") || get("sublocality") || get("sublocality_level_1") || "";
  const loc = place.location || {};
  return {
    displayName: place.formattedAddress || "",
    street,
    neighborhood,
    city,
    postcode: get("postal_code"),
    lat: loc.latitude != null ? Number(loc.latitude) : null,
    lng: loc.longitude != null ? Number(loc.longitude) : null,
  };
}

async function googleResolve(suggestion, { sessionToken } = {}) {
  const placeId = suggestion?.raw?.placeId;
  if (!placeId) return null;
  const url =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` +
    "?languageCode=he" +
    (sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : "");
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": googleKey(),
      "X-Goog-FieldMask": "addressComponents,location,formattedAddress",
    },
  });
  if (!res.ok) return null;
  const place = await res.json();
  return normalizeGoogleDetails(place);
}

// --- public API (provider dispatch) ------------------------------------------

/** Fetch address suggestions for `query`. Google when a key is present,
 *  Nominatim otherwise. Returns a deduped Suggestion[]. */
export async function autocompleteAddresses(query, opts = {}) {
  if (hasGoogleKey()) return googleAutocomplete(query, opts);
  return nominatimAutocomplete(query, opts);
}

/** Resolve a selected suggestion → a full Place. Nominatim rows are already
 *  resolved (their `raw`); Google needs a Place Details call. */
export async function resolveSuggestion(suggestion, opts = {}) {
  if (suggestion?.provider === "google") return googleResolve(suggestion, opts);
  return suggestion?.raw ?? null;
}
