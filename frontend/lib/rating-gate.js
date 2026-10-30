/**
 * MEH-1864 — rating data gate.
 *
 * Rating UI is only meaningful where real review data backs it. Two rules,
 * both frontend-only (the backend keeps serving `?sort=rating` and keeps
 * returning `avg_rating` — a hand-typed URL still answers 200):
 *
 *   1. A sort-by-rating control is offered only once at least
 *      RATING_SORT_THRESHOLD businesses carry >= 1 review. Below that, an
 *      ordering by rating is noise: it ranks a handful of rated businesses
 *      above everyone else on data most of the catalog does not have.
 *   2. No surface renders a rating for a business with zero reviews — no
 *      stars, no "0", no filler. (Each card/detail surface already carries
 *      its own review-count gate; this module is the *sort*-side half.)
 *
 * `reviews_count` is the trust anchor, not `avg_rating`: the column defaults
 * to 0 (models.py:270) so "0.0" is indistinguishable from "unrated" on the
 * value alone, while `reviews_count >= 1` says a human actually left a review.
 */

export const RATING_SORT_THRESHOLD = 5;

/**
 * How many entries in `list` carry at least one review.
 * Non-array input → 0 (callers hydrate from network payloads that can be null).
 */
export function countRatedProducers(list) {
  if (!Array.isArray(list)) return 0;
  return list.reduce(
    (total, producer) => total + (Number(producer?.reviews_count) >= 1 ? 1 : 0),
    0,
  );
}

/**
 * True when the catalog has enough reviewed businesses for a rating sort to
 * mean something.
 *
 * `list` may be a full client-side feed (/map) OR a `?sort=rating` window of
 * exactly RATING_SORT_THRESHOLD rows (/producers SSR). The window is a sound
 * source for this question, not a pagination guess: review stars are
 * `ge=1, le=5` (schemas.py:2391) and `_recompute` writes the pair together
 * (reviews.py:110-124), so a reviewed business has `avg_rating >= 1` while an
 * unreviewed one has 0.0 — and `?sort=rating` puts every unreviewed / NULL
 * row last on its FIRST order key (producer_listing.py, rating branch; the
 * Bayesian key below it only orders the reviewed rows — MEH-2617). Every reviewed business therefore
 * sorts strictly above every unreviewed one, so a top-N window holding fewer
 * than N reviewed rows means fewer than N exist catalog-wide.
 *
 * That conclusion rests on the `reviews_count >= 1 ⟺ avg_rating >= 1`
 * invariant, so state it rather than claim the window is exact unconditionally.
 * Drift in either direction (a reviewed row with a NULL/0 average, an
 * unreviewed row with a stale average) can only push a reviewed row out of the
 * window, i.e. UNDERCOUNT — which hides the control. The error is fail-closed,
 * never a rating sort offered on data that isn't there.
 */
export function isRatingSortEnabled(list) {
  return countRatedProducers(list) >= RATING_SORT_THRESHOLD;
}

// MEH-2617: Bayesian-average constants for the rating sort. Mirrors
// RATING_PRIOR_MEAN / RATING_PRIOR_WEIGHT in
// backend/app/services/producer_queries.py — /producers sorts server-side,
// /map sorts the same feed client-side, and the two orders must agree.
export const RATING_PRIOR_MEAN = 4.0;
export const RATING_PRIOR_WEIGHT = 5;

/**
 * MEH-2617: the score the rating sort orders by — (avg × n + M × C) / (n + C).
 * One 5.0 review scores 4.17; a 4.8 from twelve scores 4.56. Ordering only:
 * the displayed rating is still `avg_rating`. Callers sort unreviewed rows
 * last on their own key first (they would score exactly M here).
 */
export function weightedRating(producer) {
  const n = Number(producer?.reviews_count) || 0;
  const avg = Number(producer?.avg_rating) || 0;
  return (avg * n + RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT) / (n + RATING_PRIOR_WEIGHT);
}
