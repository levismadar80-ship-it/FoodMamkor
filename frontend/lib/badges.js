/**
 * Badge system (MEH-18). Pure functions — no React, no DOM.
 *
 * Badges (Phase B fold, April 2026; license added MEH-531):
 *   verified     (manual)  — producer.verification_tier === "verified"   (MEH-762; ADR-022 tier — replaced the legacy admin-verified flag)
 *   recommended  (manual)  — producer.is_recommended
 *   license      (manual)  — producer.has_producer_license AND verification_tier === "verified" (MEH-531; verified-gate MEH-1162)
 *   new          (auto)    — producer.days_since_created <= 30
 *   grass_fed    (manual)  — producer.grass_fed
 *   (organic REMOVED — MEH-1259: self-declared organic_certified presented an
 *    unverified claim as a certificate; hidden until an admin-verified flow.)
 *   gluten_free  (manual)  — has_gluten_free_products  (any product is_gluten_free,  MEH-479)
 *   vegetarian   (manual)  — has_vegetarian_products   (any product is_vegetarian OR is_vegan, MEH-1438)
 *   vegan        (manual)  — has_vegan_products        (any product is_vegan,        MEH-479)
 *   lactose_free (manual)  — has_lactose_free_products (any product is_lactose_free, MEH-479)
 *   kosher       (verified) — producer.kashrut_verified_at present (admin-verified cert, MEH-986; free-text producer.kosher drives NO badge)
 *   delivery     (auto)    — producer.has_delivery OR delivery_count > 0
 *   products     (auto)    — producer.products_count >= 3
 *
 * Priority (highest first — drives the card's max-2 truncation):
 *   verified > recommended > license > new > grass_fed > gluten_free > vegetarian > vegan > lactose_free > kosher > delivery > products
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
    // collapsed brand-secondary into primary.
    // MEH-1168 P1: demoted primary → muted (tonal cream/hairline). Solid green
    // is reserved for the single primary CTA (the WhatsApp action) per
    // DESIGN.md § Action hierarchy — a solid-green "חדש" chip competed with it.
    color: "muted",
  },
  // MEH-1259 (P0 legal — חוק להסדרת תוצרת אורגנית תשס"ה-2005): the public
  // "אורגני" badge is REMOVED. It lit on the self-declared producer.organic_certified
  // boolean while the tooltip claimed "תעודת אורגני בתוקף" — presenting an
  // unverified self-declaration as a certificate (same risk family as MEH-986
  // kosher). Hidden until an admin-verified flow exists (post-launch, Option B —
  // KashrutBadgeRequest pattern). The column + owner toggle + admin checkbox are
  // KEPT (zero data loss); only the public badge/chip/filter surfaces are gone.
  grass_fed: {
    key: "grass_fed",
    label: "גראס פד",
    tooltip: "בעלי החיים גדלים על מרעה ולא על תערובת תעשייתית.",
    color: "muted",
  },
  // MEH-1439: tooltips state any-product semantics, not an all-products claim.
  // The badge lights on has_X_products (ANY marked product, MEH-479) — the old
  // copy ("כל המוצרים", "המוצרים מתאימים") over-claimed the whole catalog (same
  // over-claim risk family as MEH-1259 organic).
  gluten_free: {
    key: "gluten_free",
    label: "ללא גלוטן",
    tooltip: "לעסק יש מוצרים ללא גלוטן מסומנים בקטלוג.",
    color: "muted",
  },
  // MEH-1438: vegetarian badge — lights on has_vegetarian_products (aggregation
  // counts is_vegan too, since a vegan product is vegetarian). Priority sits
  // after gluten_free, before vegan.
  vegetarian: {
    key: "vegetarian",
    label: "צמחוני",
    tooltip: "לעסק יש מוצרים צמחוניים מסומנים בקטלוג.",
    color: "muted",
  },
  vegan: {
    key: "vegan",
    label: "טבעוני",
    tooltip: "לעסק יש מוצרים טבעוניים מסומנים בקטלוג.",
    color: "muted",
  },
  lactose_free: {
    key: "lactose_free",
    label: "ללא לקטוז",
    tooltip: "לעסק יש מוצרים ללא לקטוז מסומנים בקטלוג.",
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
  // MEH-1259: "organic" removed — see BADGE_CONFIG note above.
  "grass_fed",
  "gluten_free",
  "vegetarian",
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
      // MEH-1162 (audit F10): has_producer_license alone is SELF-DECLARED —
      // a fresh producer typing 000000000 got the chip. Gate on the ADR-022
      // verification_tier like the verified badge at :136: "verified" means
      // an admin actually checked the document (MEH-766 model). declared/
      // null tiers render nothing.
      return (
        producer.verification_tier === "verified" &&
        !!producer.has_producer_license
      );
    case "new":
      return (
        typeof producer.days_since_created === "number" &&
        producer.days_since_created >= 0 &&
        producer.days_since_created <= NEW_DAYS
      );
    // MEH-1259: no "organic" case — the badge is removed from public surfaces
    // (see BADGE_CONFIG note). producer.organic_certified stays on the payload
    // (owner/admin managed) but drives NO public badge.
    case "grass_fed":
      return !!producer.grass_fed;
    case "gluten_free":
      // MEH-293/MEH-479: aggregated from products.is_gluten_free.
      return !!producer.has_gluten_free_products;
    case "vegetarian":
      // MEH-1438: aggregated has_vegetarian_products (is_vegetarian OR is_vegan).
      return !!producer.has_vegetarian_products;
    case "vegan":
      return !!producer.has_vegan_products;
    case "lactose_free":
      return !!producer.has_lactose_free_products;
    case "kosher":
      // MEH-986 ch2 (P0 legal — חוק איסור הונאה בכשרות): the public kosher badge
      // must render ONLY for admin-verified kashrut, never from the free-text
      // producer.kosher field. kashrut_verified_at is stamped by the admin
      // approve flow (admin_kashrut.py:75, alongside kashrut_badges) — the same
      // "verified signal" shape the verified badge uses at :136. Free-text
      // producer.kosher now drives NO public badge.
      // MEH-1260: expiry enforcement — an expired certificate earns no badge.
      // Legacy rows verified before the expiry era carry NULL expires_at and
      // stay valid (do NOT break them). Mirrors producer_listing.py ?kosher.
      return (
        !!producer.kashrut_verified_at &&
        (!producer.kashrut_expires_at ||
          new Date(producer.kashrut_expires_at) > new Date())
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
