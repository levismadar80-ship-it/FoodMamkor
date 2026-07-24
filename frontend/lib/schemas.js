import { z } from "zod";

// Producer from API — lat/lng can be null in the DB (producers registered
// without geocoding). Marked optional/nullable so the schema doesn't reject
// them outright; callers (marker creation, flyTo) guard against null/NaN
// before use.
export const ProducerSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
  // MEH-1269: server-computed great-circle distance (km) attached in geo
  // mode only (ProducerListOut.distance_km, backend producer_listing.py:353,
  // ORDER BY distance ASC). Declared so z.object stops stripping it; null in
  // non-geo listings. Cards still derive the on-screen label client-side from
  // the sessionStorage GPS fix (ProducerCard.jsx:179) — this preserves the
  // server value for any future distance-aware consumer.
  distance_km: z.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  // MEH-766 ch5: is_verified dropped from the backend contract (ADR-022) —
  // seals read verification_tier below; the legacy boolean is gone.
  // MEH-766 ch1: public doc-verification tier (computed backend, ProducerListOut).
  // Declared so z.object stops stripping it.
  verification_tier: z.enum(["verified", "declared"]).nullable().optional(),
  // MEH-766 ch5 (auto-review on #1578 + sibling grep): the OTHER two ADR-022
  // surface fields were silently stripped on the Zod-parsed map feed (same
  // MEH-901 class) — BadgeRow reads both (verified_at:84 date tooltip,
  // verification_doc_type:86 tooltip variant). verified_at is a date-only
  // string (backend _verified_at_date_only collapses to YYYY-MM-DD).
  verified_at: z.string().nullable().optional(),
  verification_doc_type: z.enum(["license", "exemption", "cosmetics"]).nullable().optional(),
  plan: z.string().optional(),
  images: z.array(z.string()).optional().default([]),
  // MEH-826: weekly hours string ("Sun-Thu 09:00-18:00, …") — without this the
  // z.object strip would drop it before MapProducerCard's open/closed line.
  opening_hours: z.string().nullable().optional(),
  // MEH-901: 12 fields below were silently stripped by z.object's default
  // unknown-key behavior — same mechanism as the opening_hours precedent —
  // breaking the MEH-798 category chip + the contact-method router on /map.
  // All permissive (.optional() / .nullable() where the API observably
  // returns null) so the all-or-nothing array parse at useProducersFeed.js:41
  // can never newly drop a producer.
  //   - categories.name is .nullable().optional() (NOT strict z.string()):
  //     consumers (chip, useMapFilters) already guard `category?.name`, and
  //     a strict requirement would kill the entire feed on a single null.
  //   - categories.id is union(string|number): defensive against a future
  //     int→uuid migration on the category PK (mirrors producer.id pattern).
  // MEH-902: delivery_areas is now declared (was excluded in MEH-901 because
  // the API serializer dropped it — fixed at backend ProducerListOut:744).
  // The flat `delivery_cities` column the API also returns is unused / a
  // separate cleanup ticket; we do NOT declare it here.
  categories: z.array(z.object({
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().nullable().optional(),
    emoji: z.string().optional(),
  })).optional().default([]),
  slug: z.string().nullable().optional(),
  starting_price_label: z.string().nullable().optional(),
  price_range: z.string().nullable().optional(),
  avg_rating: z.number().nullable().optional(),
  reviews_count: z.number().int().nullable().optional(),
  primary_contact_method: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
  external_order_form: z.string().nullable().optional(),
  // MEH-902: delivery relation — array of {city, delivery_day, ...} that
  // MapProducerCard.jsx:44-46 reads to render the "delivers to your city"
  // pill. Permissive on every field (incl. city/delivery_day) so the
  // all-or-nothing parse never drops a producer with a partial row.
  delivery_areas: z.array(z.object({
    id: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    min_order: z.number().nullable().optional(),
    delivery_day: z.string().nullable().optional(),
  })).optional().default([]),
  // MEH-1412 (MEH-1388 chunk 3): physical presence points from chunk 2's
  // serializer (backend ProducerLocationOut) — {kind, label, city, lat, lng,
  // is_primary, precision}. Declared so z.object stops stripping it (same
  // MEH-901/MEH-826/MEH-902 mechanism as delivery_areas above); permissive on
  // every field so the all-or-nothing parse (useProducersFeed) never drops a
  // producer with a partial row. MapComponent fans these into per-location
  // markers (branch/primary = standard pin, pickup/market_stand = secondary).
  locations: z.array(z.object({
    kind: z.string().nullable().optional(),
    label: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    lat: z.number().finite().nullable().optional(),
    lng: z.number().finite().nullable().optional(),
    is_primary: z.boolean().nullable().optional(),
    precision: z.string().nullable().optional(),
  })).optional().default([]),
});

// MEH-779: response shape of GET /producers — an array of producers.
// Rule-19 belt-and-braces on the *response* side (the request side is
// GeoSearchSchema below). z.object strips unknown keys by default, so the
// backend can add fields without breaking this; only a structural mismatch
// (e.g. name missing/non-string, or the whole payload not an array) fails
// the parse. On failure the feed falls back to its existing error state
// (empty list + toast) rather than crashing the map — see useProducersFeed.
export const ProducersResponseSchema = z.array(ProducerSchema);

// Geo search params sent to GET /producers.
// radius_km is capped at 50 to prevent Haversine full-table scans that
// 500 on the backend for very zoomed-out viewports (≥70 km observed).
// boundsToCenterRadius() already clamps at the source; this schema is a
// belt-and-braces safety net in case a future caller bypasses it.
export const GeoSearchSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  radius_km: z
    .number()
    .min(1, "הזיזי את המפה לפני החיפוש")
    .max(50, "הקטיני את מרחק החיפוש — אזור גדול מדי"),
});

// Validated coords before any Leaflet flyTo / marker creation call.
export const CoordSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});

// MEH-1421 (MEH-1388 chunk 4a): owner location-editor payload. safeParse'd in
// LocationsEditor before every POST/PUT to /producers/me/locations (Rule 19).
// Bounds mirror the backend ProducerLocationCreate (schemas.py); the
// single-primary + same-city-label rules are cross-row and stay server-side
// (surfaced as a 422 toast). lat/lng are nullable — the owner may save a point
// before she has exact coordinates (manual entry, no geocoding this chunk).
export const LocationInputSchema = z.object({
  kind: z.enum(["branch", "pickup", "market_stand"], {
    error: "בחרי סוג מיקום",
  }),
  label: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  lat: z
    .number({ error: "קו רוחב לא תקין" })
    .min(-90, "קו רוחב לא תקין")
    .max(90, "קו רוחב לא תקין")
    .nullable()
    .optional(),
  lng: z
    .number({ error: "קו אורך לא תקין" })
    .min(-180, "קו אורך לא תקין")
    .max(180, "קו אורך לא תקין")
    .nullable()
    .optional(),
  opening_hours: z.string().trim().max(2000).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  is_primary: z.boolean().optional(),
  location_precision: z.enum(["exact", "approximate"]).optional(),
});
