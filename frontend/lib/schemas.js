import { z } from "zod";

// Producer from API — lat/lng can be null in the DB (producers registered
// without geocoding). Marked optional/nullable so the schema doesn't reject
// them outright; callers (marker creation, flyTo) guard against null/NaN
// before use.
//
// MEH-1752: base + extend, mirroring the backend one-to-one. The server
// declares `class ProducerListOut(BaseModel)`
// (backend/app/schemas/schemas.py:1907) and
// `class ProducerDetailOut(ProducerListOut)` (:2128) — literal inheritance,
// with `GET /producers/{producer_id}` and `GET /producers/by-slug/{slug}`
// declaring `response_model=ProducerDetailOut`
// (backend/app/routers/producers.py:286, :247). Measured against those two
// classes on 03/08/2026: ProducerListOut = 64 fields, ProducerDetailOut = 81,
// detail-only = 17, **list-only = 0**. That exact subset relation is what
// `.extend()` expresses in Zod, so the two schemas below carry the shared
// fields once instead of twice.
//
// Field placement here is DERIVED, not guessed: every key sits in the schema
// whose Pydantic class declares it. Zod keys declared by NEITHER class: none
// (checked 03/08/2026 — the absence is the finding).
//
// This split is structural only. `ProducerSchema` remains exported as an alias
// of the detail schema below, so no call site changes shape in this PR;
// migrating the six parse sites is a separate ticket.
export const ProducerListSchema = z.object({
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
  contact_email: z.string().nullable().optional(),
  // MEH-1752: `website` · `instagram` · `facebook` · `external_order_form`
  // used to sit here. They are declared by ProducerDetailOut and NOT by
  // ProducerListOut, so they now live on ProducerDetailSchema below.
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
  // MEH-1823: the single active offer, or null. Declared for the same reason
  // as locations/delivery_areas above — an undeclared key is STRIPPED by
  // z.object, so the chip would silently never render on the two Zod-parsed
  // feeds (home grid + /map) while working fine on the unparsed ones. That is
  // the MEH-826 / MEH-901 / MEH-902 / MEH-1704 mechanism, five times over.
  // Permissive per field: the all-or-nothing parse must not drop a whole
  // producer because one offer field arrived in an unexpected shape, and
  // OfferBadge already refuses to render an unknown offer_type.
  active_offer: z.object({
    id: z.union([z.string(), z.number()]).nullable().optional(),
    offer_type: z.string().nullable().optional(),
    threshold_value: z.number().nullable().optional(),
    threshold_unit: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    starts_at: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),
  }).nullable().optional(),
  // MEH-1704: the 13 remaining badge inputs. `lib/badges.js::earnsBadge` reads
  // 14 producer fields; only `verification_tier` (:25) was declared, so on both
  // Zod-parsed feeds — home grid (use-home-page.js:326/:360/:430) and /map
  // (app/[locale]/map/state/useProducersFeed.js:49) — z.object stripped the
  // other 13 and 11 of the 12 badges in BADGE_PRIORITY could never light.
  // Same mechanism as MEH-826 / MEH-901 / MEH-902 / MEH-766 ch5 / MEH-1412
  // above; this is its fifth recurrence, which is why it now ships with a
  // structural guard (__tests__/ProducerSchemaBadgeParity.test.js) rather than
  // a sixth declaration and a hope.
  //
  // Permissive by construction — the feed parses all-or-nothing
  // (useProducersFeed.js:41), so a required badge field would drop an entire
  // producer from the grid rather than merely lose it a badge. Losing a badge
  // is the bug being fixed; losing a business would be a worse one. The guard
  // asserts this property directly, not just the declarations.
  //
  // NOT declared here, deliberately: `organic_certified` (badges.js:189) and
  // the free-text `kosher` (:206, :209) appear ONLY in comments — MEH-1259
  // removed the organic badge and MEH-986 ch2 made kosher render exclusively
  // from admin-stamped `kashrut_verified_at`. Neither is read by executable
  // code, so neither is a badge input.
  has_producer_license: z.boolean().nullable().optional(),   // → license
  is_recommended: z.boolean().nullable().optional(),         // → recommended (בחירת העורכת)
  days_since_created: z.number().nullable().optional(),      // → new (חדש)
  grass_fed: z.boolean().nullable().optional(),              // → grass_fed
  has_gluten_free_products: z.boolean().nullable().optional(),   // → gluten_free
  has_vegetarian_products: z.boolean().nullable().optional(),    // → vegetarian
  has_vegan_products: z.boolean().nullable().optional(),         // → vegan
  has_lactose_free_products: z.boolean().nullable().optional(),  // → lactose_free
  // kosher pair — verified-only (MEH-986 ch2) + expiry (MEH-1260). Both are
  // date-ish strings from the backend; `z.string()` not `z.date()` because the
  // payload is JSON and badges.js:216 does its own `new Date(...)` comparison.
  kashrut_verified_at: z.string().nullable().optional(),     // → kosher
  kashrut_expires_at: z.string().nullable().optional(),      // → kosher (expiry)
  has_delivery: z.boolean().nullable().optional(),           // → delivery
  delivery_count: z.number().nullable().optional(),          // → delivery (fallback count)
  products_count: z.number().nullable().optional(),          // → products
  // MEH-1719: the SEVENTH recurrence, and the first one that is not about
  // badges at all. MEH-1704 declared what `badges.js::earnsBadge` reads and
  // its guard derives the field list from that function — so these nine,
  // which `ProducerCard` reads DIRECTLY, sat outside the guard's proof by
  // construction. Every one is serialized by ProducerListOut
  // (backend/app/schemas/schemas.py:1649-1738); each was stripped in silence
  // on the two parsed feeds, home grid + /map.
  //
  // Checked before declaring, per MEH-1719 §2ד: schemas.js documents exactly
  // TWO deliberate omissions — `delivery_cities` (:51-52) and the
  // comment-only `organic_certified` / free-text `kosher` (:111-116). Neither
  // covers any field below. **No documented rationale was found for any of
  // these nine**, and they look exactly like the six prior recurrences, so
  // they are declared rather than preserved.
  //
  // Permissive for the same reason as the badge block above: the /map feed
  // parses all-or-nothing (app/[locale]/map/state/useProducersFeed.js:41), so
  // one strict declaration drops a whole business from the feed. Deliberately
  // `z.string()` and not `z.enum()` on the two availability fields — a new
  // backend state value must cost a dot, never a producer.
  trust_tier: z.number().nullable().optional(),              // → TrustBadge ("מובילת קהילה"/"שגרירת מהמקור"), ProducerCard.jsx:353-354 gate `>= 4`
  favorites_count: z.number().nullable().optional(),         // → heart counter seed, ProducerCard.jsx:161/:166
  short_description: z.string().nullable().optional(),       // → card description line, ProducerCard.jsx:202
  top_product_name: z.string().nullable().optional(),        // → card description fallback, ProducerCard.jsx:202
  availability_state: z.string().nullable().optional(),      // → availability dot, ProducerCard.jsx:36
  availability_status: z.string().nullable().optional(),     // → availability dot (legacy "vacation"), ProducerCard.jsx:37
  is_available_today: z.boolean().nullable().optional(),     // → availability dot + fridayMode pill, ProducerCard.jsx:39/:435
  has_physical_location: z.boolean().nullable().optional(),  // → "משלוחים בלבד" pill, ProducerCard.jsx:356
  offers_delivery: z.boolean().nullable().optional(),        // → "משלוחים בלבד" pill, ProducerCard.jsx:356
  // NOT read by ProducerCard today, so the card-derived guard below cannot
  // reach it — declared on the backend contract instead (ProducerListOut,
  // schemas.py:1725). MEH-1711's card kashrut label resolves from this array
  // and CANNOT fire while z.object strips it; that ticket is blocked on this
  // line. Covered by the round-trip assertion in the guard, not by extraction.
  kashrut_badges: z.array(z.string()).nullable().optional(), // → MEH-1711 card kashrut label (certification name)
});

// MEH-1752: the detail contract — `GET /producers/{producer_id}` and
// `GET /producers/by-slug/{slug}`. Mirrors
// `class ProducerDetailOut(ProducerListOut)`
// (backend/app/schemas/schemas.py:2128) with `.extend()`, which is the Zod
// spelling of that inheritance: the shared fields are declared once, on
// ProducerListSchema, and only the delta appears here.
//
// The four fields below are the detail-only keys the hand-written schema
// already declared. `docs/audits/producer-detail-page-validation.md` §3 ruled
// them NOT-to-delete after measuring that all four are read by
// `ContactCard.jsx` (`instagram`:105, `website`:114, `facebook`:120,
// `external_order_form`:121) and that `website` is additionally read
// server-side by `lib/seo.js`. They were inert only because they were
// declared on a schema that five list feeds parse; this gives them the
// contract they actually belong to instead of removing them.
//
// The other 13 detail-only fields ProducerDetailOut serves — `contact_name`,
// `created_at`, `custom_questions`, `established_year`, `google_place_id`,
// `order_window`, `owner_bio`, `owner_photo_url`, `products`, `report_count`,
// `story_card_url`, `updated_at`, `whatsapp_group` — are still undeclared,
// exactly as they were before this split (audit D2). Declaring them would
// change what the parse sites receive, which this structural PR deliberately
// does not do.
export const ProducerDetailSchema = ProducerListSchema.extend({
  website: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
  external_order_form: z.string().nullable().optional(),
});

// MEH-1752: back-compat alias. Every existing importer of `ProducerSchema`
// keeps the exact field set it had before the split — the pre-split schema
// declared all four detail-only fields, so the detail schema is its literal
// equivalent, not an approximation. Migrating the six call sites to
// the schema each one actually needs is a separate ticket; until then this
// alias guarantees the split is a no-op at runtime.
export const ProducerSchema = ProducerDetailSchema;

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
