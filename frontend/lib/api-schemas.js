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

// GET /users/me/favorites → list[FavoriteOut].
// The cache only reads producer_id (falls back to id); keep the rest loose.
export const FavoriteSchema = z.object({
  producer_id: z.union([z.string(), z.number()]).nullable().optional(),
  id: z.union([z.string(), z.number()]).nullable().optional(),
});
export const FavoritesResponseSchema = z.array(FavoriteSchema);
