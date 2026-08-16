// Rule-19 (Zod validation before consuming API responses) — NON-map sites.
//
// The map feed already validates via lib/schemas.js (ProducerSchema /
// ProducersResponseSchema, MEH-779). This module adds belt-and-braces
// schemas for the remaining lib/ data-layer consumers (home page,
// favorites cache) so a structurally-broken response routes to each
// caller's existing error state instead of crashing render.
//
// All object schemas strip unknown keys (Zod default), so the backend can
// add fields without breaking the parse — only a structural mismatch
// (missing/!typed required field, or wrong container type) fails.
import { z } from "zod";

// Re-export the producer schemas so non-map callers import from one place;
// the canonical definitions still live in lib/schemas.js.
// MEH-1713: also imported as a local binding — `export … from` re-exports
// without binding the name in this module, and FavoriteWithProducerSchema
// below composes ProducerSchema rather than redeclaring it.
import { ProducerSchema } from "@/lib/schemas";
export { ProducerSchema, ProducersResponseSchema } from "@/lib/schemas";

// GET /categories → list[CategoryOut] = { id:int, name:str, emoji?:str|null }
export const CategorySchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  emoji: z.string().nullable().optional(),
});
export const CategoriesResponseSchema = z.array(CategorySchema);

// GET /stats → StatsOut = { producers_count:int, categories_count:int }
export const StatsSchema = z.object({
  producers_count: z.number(),
  categories_count: z.number(),
});

// GET /producers/random → ProducerRandomOut = { id:UUID, slug:str|null } —
// MEH-1288 homepage "הפתיעו אותי" button. A malformed payload routes to the
// caller's no-op (no navigation) instead of pushing a broken href.
export const RandomProducerSchema = z.object({
  id: z.union([z.string(), z.number()]),
  slug: z.string().nullable().optional(),
});

// GET /users/me/favorites → list[FavoriteOut].
// Backend FavoriteOut.producer_id is a required, non-nullable UUID, so it
// must be present for the parse to succeed — otherwise a payload of empty
// objects would pass and the guard would be toothless (a malformed
// response should route to the empty-cache fallback). `id` stays an
// optional defensive fallback since the cache reads `producer_id ?? id`.
export const FavoriteSchema = z.object({
  producer_id: z.union([z.string(), z.number()]),
  id: z.union([z.string(), z.number()]).nullable().optional(),
});
export const FavoritesResponseSchema = z.array(FavoriteSchema);

// MEH-1713: the /favorites PAGE row — distinct from FavoriteSchema above,
// which is heart-state for lib/favorites-cache.js (producer_id only, no
// nested producer). Backend contract: FavoriteOut
// (backend/app/schemas/schemas.py:2131) = { producer_id, producer:
// ProducerListOut, created_at }, with the nested producer enriched by
// attach_badge_fields + attach_favorites_counts (routers/favorites.py:44-47).
//
// The nested producer REUSES ProducerSchema — imported, never redeclared.
// MEH-1704 fixed exactly this bug (a hand-written producer schema silently
// stripping 13 badge fields) on the grid and /map; hand-rolling a second copy
// here would have been its sixth recurrence, on a third surface.
//
// ...but `.loose()` is load-bearing, and importing ProducerSchema alone is NOT
// enough. ProducerSchema is badge-complete, not a ProducerListOut mirror: it
// declares the 14 fields `badges.js::earnsBadge` reads and nothing else. A
// plain z.object parse strips every OTHER field ProducerCard renders —
// measured on a 12-key card fixture, a bare ProducerSchema.parse kept 2 of 12
// (`trust_tier`, `favorites_count`, `short_description`, `top_product_name`,
// `availability_state`, `availability_status`, `is_available_today`,
// `has_physical_location`, `offers_delivery` all vanish, and all 9 ARE
// serialized by ProducerListOut, schemas.py:1649-1738). `.loose()` keeps 12
// of 12. /favorites renders raw, unvalidated data today, so a stripping parse
// would REGRESS the page it is meant to harden.
//
// `.loose()` is the Zod-4 spelling of the deprecated `.passthrough()` — it
// validates the declared fields and keeps the undeclared ones, which is the
// correct posture for a route that only needs a STRUCTURAL guarantee. It also
// leaves lib/schemas.js untouched: `.loose()` returns a new schema, it does
// not mutate ProducerSchema, so the grid and /map keep their deliberate
// all-or-nothing stripping parse.
// No `z.array(...)` companion here, unlike FavoritesResponseSchema above: the
// caller parses PER ROW so one malformed favorite costs one card instead of
// the whole hand-curated list (see FavoritesClient.jsx). An array schema would
// be the all-or-nothing shape this route deliberately rejects.
export const FavoriteWithProducerSchema = z.object({
  producer_id: z.union([z.string(), z.number()]),
  producer: ProducerSchema.loose(),
  created_at: z.string().nullable().optional(),
});
