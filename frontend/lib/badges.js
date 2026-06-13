/**
 * Badge system (MEH-18). Pure functions — no React, no DOM.
 *
 * Badges (Phase B fold, April 2026; license added MEH-531):
 *   verified     (manual)  — producer.verification_tier === "verified"   (MEH-762; ADR-022 tier — replaced the legacy admin-verified flag)
 *   recommended  (manual)  — producer.is_recommended
 *   license      (manual)  — producer.has_producer_license       (MEH-531)
 *   new          (auto)    — producer.days_since_created <= 30
 *   organic      (manual)  — producer.organic_certified
 *   grass_fed    (manual)  — producer.grass_fed
 *   gluten_free  (manual)  — has_gluten_free_products  (any product is_gluten_free,  MEH-479)
 *   vegan        (manual)  — has_vegan_products        (any product is_vegan,        MEH-479)
 *   lactose_free (manual)  — has_lactose_free_products (any product is_lactose_free, MEH-479)
 *   kosher       (manual)  — producer.kosher (any non-empty string)
 *   delivery     (auto)    — producer.has_delivery OR delivery_count > 0
 *   products     (auto)    — producer.products_count >= 3
 *
 * Priority (highest first — drives the card's max-2 truncation):
 *   verified > recommended > license > new > organic > grass_fed > gluten_free > vegan > lactose_free > kosher > delivery > products
 *
 * ProducerCard renders the top-priority 2 with `topBadges(producer, 2)`.
 * ProducerDetail renders everything with `allBadges(producer)`.
 */

export const BADGE_CONFIG = {
  verified: {
    key: "verified",
    label: "מאומת",
    // MEH-762: ADR-022 tier-1 copy lock (terms §5.2-aligned). Replaces the
    // pre-ADR-022 over-claim ("עבר אימות זהות ורישוי"). en gap is inherited
    // legacy — dies when MEH-76 S12 wires the MEH-758 keys.
    tooltip: "בית העסק הציג מסמך רישוי או אישור פטור רשמי שנבדק ידנית.",
    color: "primary",
  },
  recommended: {
    key: "recommended",
    label: "מומלץ",
    tooltip: "המלצת עורכת מהמקור — אהבנו את איכות המוצרים או השירות.",
    color: "accent",
  },
  // MEH-531: license badge — trust signal for Ministry of Health producer
  // license. Field source: ProducerListOut.has_producer_license (computed
  // boolean from MEH-530's producer_license_number, schemas.py:547).
  license: {
    key: "license",
    label: "רישיון יצרן",
    tooltip: "בית העסק מחזיק ברישיון יצרן ממשרד הבריאות.",
    color: "primary",
  },
  new: {
    key: "new",
    label: "חדש",
    tooltip: "העסק הצטרף אלינו בחודש האחרון.",
    // MEH-792: was "secondary" — an alias of primary ever since MEH-703
    // collapsed brand-secondary into primary. Named for what it renders.
    color: "primary",
  },
  organic: {
    key: "organic",
    label: "אורגני",
    tooltip: "בית העסק מחזיק בתעודת אורגני בתוקף.",
    color: "muted",
  },
  grass_fed: {
    key: "grass_fed",
    label: "גראס פד",
    tooltip: "בעלי החיים גדלים על מרעה ולא על תערובת תעשייתית.",
    color: "muted",
  },
  gluten_free: {
    key: "gluten_free",
    label: "ללא גלוטן",
    tooltip: "המוצרים מתאימים לאנשים עם צליאק או רגישות לגלוטן.",
    color: "muted",
  },
  vegan: {
    key: "vegan",
    label: "טבעוני",
    tooltip: "כל המוצרים טבעוניים — ללא כל מרכיב מן החי.",
    color: "muted",
  },
  lactose_free: {
    key: "lactose_free",
    label: "ללא לקטוז",
    tooltip: "המוצרים מתאימים לאנשים עם אי-סבילות ללקטוז.",
    color: "muted",
  },
  kosher: {
    key: "kosher",
    label: "כשר",
    tooltip: "המוצרים תחת השגחת כשרות.",
    color: "muted",
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
  "license",
  "new",
  "organic",
  "grass_fed",
  "gluten_free",
  "vegan",
  "lactose_free",
  "kosher",
  "delivery",
  "products",
];

const NEW_DAYS = 30;
const PRODUCTS_MIN = 3;

function earnsBadge(producer, key) {
  if (!producer) return false;
  switch (key) {
    case "verified":
      // MEH-762: drive off the ADR-022 public tier, NOT the legacy admin-
      // verified flag (which over-claimed). verification_tier is computed in
      // ProducerListOut (schemas.py); "verified" === a checked license/exemption
      // document. The legacy field stays (Chunk 4 = badge role only) — its full
      // retirement + the trust_tier coupling are MEH-766.
      return producer.verification_tier === "verified";
    case "recommended":
      return !!producer.is_recommended;
    case "license":
      // MEH-531: ProducerListOut.has_producer_license (computed in
      // attach_badge_fields, schemas.py:547).
      return !!producer.has_producer_license;
    case "new":
      return (
        typeof producer.days_since_created === "number" &&
        producer.days_since_created >= 0 &&
        producer.days_since_created <= NEW_DAYS
      );
    case "organic":
      return !!producer.organic_certified;
    case "grass_fed":
      return !!producer.grass_fed;
    case "gluten_free":
      // MEH-293/MEH-479: aggregated from products.is_gluten_free.
      return !!producer.has_gluten_free_products;
    case "vegan":
      return !!producer.has_vegan_products;
    case "lactose_free":
      return !!producer.has_lactose_free_products;
    case "kosher":
      return typeof producer.kosher === "string" && producer.kosher.trim().length > 0;
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
