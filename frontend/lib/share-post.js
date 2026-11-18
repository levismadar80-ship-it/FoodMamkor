// @ts-check
/**
 * Module:   share-post
 * Purpose:  The data behind the owner's ready-made feed post (MEH-3330):
 *           which products go on it, how a price reads, the tracked link,
 *           and the caption. Pure functions — the canvas and the buttons live
 *           in components/producer/FeedPostCanvas.jsx.
 * Does NOT: draw anything, call the API, or own the share sheet
 *           (lib/share-link.js does).
 * Related:  lib/qr.js:31 (the same utm idea for the printed QR);
 *           app/[locale]/producer/[id]/hooks/useProducerData.js (reads
 *           `?from=` off the page url and reports it as the view's referrer —
 *           `from=share` is how a visit from a shared post is counted, MEH-3331).
 * History:  MEH-3330 (creation).
 */

import { SITE_URL } from "@/lib/env";
import { formatPriceRange, isPriceLabel } from "@/lib/utils";

/** How many products the «מה יש השבוע» post lists. */
export const WEEK_ITEMS_MAX = 3;

/** The `from` value a shared link carries — must stay in the backend's
 *  _ALLOWED_REFERRERS (services/analytics.py), or the visit counts as direct. */
export const SHARE_FROM = "share";

/**
 * @typedef {{ id?: string, name: string, description?: string|null,
 *   price_min?: number|string|null, price_max?: number|string|null,
 *   price_range?: string|null, image_url?: string|null }} PostProduct
 */

/**
 * The price as the buyer reads it, or "" when the product has none.
 * @param {PostProduct} product
 * @returns {string}
 */
export function priceLabel(product) {
  const range = formatPriceRange(product.price_min, product.price_max);
  if (range) return range;
  return isPriceLabel(product.price_range) ? String(product.price_range) : "";
}

/**
 * The first products in the owner's own order, at most WEEK_ITEMS_MAX.
 * @param {PostProduct[]} products already in owner order (lib/product-order.js)
 * @returns {PostProduct[]}
 */
export function weekItems(products) {
  return (products || []).filter((p) => p && p.name).slice(0, WEEK_ITEMS_MAX);
}

/**
 * The business page link a shared post points at, tagged so the visit is
 * counted (`from`) and readable in any analytics tool (`utm_*`).
 * @param {string} slug
 * @param {string} source  where it is posted: "share" (the share sheet) or a
 *   channel name ("instagram", "facebook", "google", "whatsapp")
 * @returns {string}
 */
export function trackedLink(slug, source) {
  const q = new URLSearchParams({ from: SHARE_FROM, utm_source: source, utm_medium: "owner_share" });
  return `${SITE_URL}/p/${encodeURIComponent(slug || "")}?${q.toString()}`;
}

/**
 * «לחם כפרי (28₪), באגט (14₪)» — the products line inside a caption.
 * @param {PostProduct[]} items
 * @returns {string}
 */
export function itemsLine(items) {
  return items
    .map((p) => {
      const price = priceLabel(p);
      return price ? `${p.name} (${price})` : p.name;
    })
    .join(", ");
}
