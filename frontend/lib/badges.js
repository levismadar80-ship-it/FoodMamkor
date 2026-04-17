/**
 * Badge system (MEH-18). Pure functions — no React, no DOM.
 *
 * Five badges:
 *   verified    (manual) — producer.is_verified
 *   recommended (manual) — producer.is_recommended
 *   new         (auto)   — producer.days_since_created <= 30
 *   delivery    (auto)   — producer.has_delivery OR delivery_count > 0
 *   products    (auto)   — producer.products_count >= 3
 *
 * Priority (highest first — drives the card's max-2 truncation):
 *   verified > recommended > new > delivery > products
 *
 * ProducerCard renders the top-priority 2 with `topBadges(producer, 2)`.
 * ProducerDetail renders everything with `allBadges(producer)`.
 */

export const BADGE_CONFIG = {
  verified: {
    key: "verified",
    label: "מאומת",
    tooltip: "העסק עבר אימות זהות ורישוי — צוות מהמקור בדק.",
    color: "primary",
  },
  recommended: {
    key: "recommended",
    label: "מומלץ",
    tooltip: "המלצת עורכת מהמקור — אהבנו את איכות המוצרים או השירות.",
    color: "accent",
  },
  new: {
    key: "new",
    label: "חדש",
    tooltip: "העסק הצטרף אלינו בחודש האחרון.",
    color: "secondary",
  },
  delivery: {
    key: "delivery",
    label: "משלוח",
    tooltip: "העסק מוסר או שולח לכתובת שלך.",
    color: "muted",
  },
  products: {
    key: "products",
    label: "מוצרים",
    tooltip: "לעסק יש 3 מוצרים או יותר בקטלוג.",
    color: "muted",
  },
};

// Priority order — left = highest. Exposed for tests.
export const BADGE_PRIORITY = [
  "verified",
  "recommended",
  "new",
  "delivery",
  "products",
];

const NEW_DAYS = 30;
const PRODUCTS_MIN = 3;

function earnsBadge(producer, key) {
  if (!producer) return false;
  switch (key) {
    case "verified":
      return !!producer.is_verified;
    case "recommended":
      return !!producer.is_recommended;
    case "new":
      return (
        typeof producer.days_since_created === "number" &&
        producer.days_since_created >= 0 &&
        producer.days_since_created <= NEW_DAYS
      );
    case "delivery":
      return (
        !!producer.has_delivery ||
        (typeof producer.delivery_count === "number" &&
          producer.delivery_count > 0)
      );
    case "products":
      return (
        typeof producer.products_count === "number" &&
        producer.products_count >= PRODUCTS_MIN
      );
    default:
      return false;
  }
}

/**
 * Ordered array of badge configs the producer has earned, highest
 * priority first.
 */
export function allBadges(producer) {
  return BADGE_PRIORITY.filter((k) => earnsBadge(producer, k)).map(
    (k) => BADGE_CONFIG[k],
  );
}

/**
 * First `limit` badges by priority. Used by ProducerCard (limit=2).
 */
export function topBadges(producer, limit = 2) {
  return allBadges(producer).slice(0, Math.max(0, limit));
}

/** Total count — handy for "..." overflow indicators. */
export function badgeCount(producer) {
  return allBadges(producer).length;
}
