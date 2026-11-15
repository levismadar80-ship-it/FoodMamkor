/**
 * Module:   entities.d.ts
 * Purpose:  The loose shapes of API rows that several components take as a
 *           prop, so a JSDoc prop can name the fields it reads instead of
 *           an untyped value. Only the fields components read are listed; the index
 *           signature keeps every other field of the API row allowed.
 * Usage:    JSDoc `import("@/types/entities").ProducerSummary` (no reference
 *           line needed — an import type resolves the module itself).
 * Does NOT: mirror backend/app/schemas — the Zod schemas in lib/schemas.js
 *           validate responses; this only names what the UI reads.
 * History:  14/11/2026 — created (MEH-3167, legacy components/ type-check).
 */

/** A business as list, card and map surfaces receive it. */
export interface ProducerSummary {
  id: string | number;
  name: string;
  slug?: string;
  city?: string;
  location_city?: string;
  location_address?: string;
  short_description?: string;
  top_product_name?: string;
  image_url?: string;
  images?: string[];
  delivery_fee?: number;
  delivery_areas?: object[];
  trust_tier?: number;
  avg_rating?: number;
  reviews_count?: number;
  favorites_count?: number;
  [key: string]: unknown;
}

/** A rescue-bag offer row (lib/rescue.js formats its units). */
export interface RescueOffer {
  producer?: ProducerSummary;
  typical_items?: string[];
  distance_km?: number | null;
  qty_left?: number;
  price_agorot?: number;
  pickup_start?: string;
  pickup_end?: string;
  [key: string]: unknown;
}

/** A category row (GET /categories). */
export interface CategoryRow {
  id: string | number;
  name: string;
  slug?: string;
  [key: string]: unknown;
}
