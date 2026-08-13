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
 *   no_added_sugar (manual) — has_no_added_sugar_products (any product is_no_added_sugar, MEH-1934)
 *   (low_carb REMOVED — MEH-2047: a nutrition claim no standard defines;
 *    EU/UK 1924/2006 does not permit it and ת"י 1145 does not cover
 *    carbohydrates. has_low_carb_products is still served by the API and is
 *    still declared in lib/schemas.js — it simply lights no badge.)
 *   kosher       (verified) — producer.kashrut_verified_at present (admin-verified cert, MEH-986; free-text producer.kosher drives NO badge)
 *   delivery     (auto)    — producer.has_delivery OR delivery_count > 0, SUPPRESSED for a
 *                            delivery-only business (MEH-1841 — specific supersedes generic)
 *   (products REMOVED — MEH-1846: it lit on products_count >= 3, true for
 *    effectively every approved business, so it differentiated nothing and
 *    diluted the badges that do. products_count itself is unchanged.)
 *
 * Priority (highest first — drives the card's max-2 truncation):
 *   verified > license > recommended > new > grass_fed > gluten_free > vegetarian > vegan > lactose_free > no_added_sugar > kosher > delivery
 *   (MEH-1934: the two new diet badges join the diet run, after lactose_free.
 *    They therefore outrank kosher and delivery, which is how every other diet
 *    badge already sits — consistency with the existing group, not a claim
 *    that a self-declared diet marking matters more than a verified kashrut
 *    certificate. Worth revisiting if the diet run keeps growing, since only
 *    the top 2 reach a card.)
 *   (MEH-1492: license — a regulatory fact — outranks recommended, an opinion.)
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
    // MEH-1492: renamed מומלץ → "בחירת העורכת" — the label now names who stands
    // behind the opinion (an editor), and the popover links out to the /about
    // criteria + the ADR-030 "can't be bought" promise (aboutHref below).
    label: "בחירת העורכת",
    tooltip:
      "בחירה אישית של עורכת מהמקור — על איכות, טריות או סיפור מיוחד. אי אפשר לקנות את התגית הזו.",
    // MEH-1492: the badge popover links here (BadgeRow wraps the tooltip in a
    // LocaleLink when aboutHref is set — mirrors the verified → /about#verification
    // pattern, MEH-1336). Editorial opinion → publish the criteria.
    aboutHref: "/about#editors-pick",
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
  // MEH-1934: tooltip carries any-product semantics (MEH-1439) — "לעסק יש
  // מוצרים … מסומנים בקטלוג", never a whole-business claim. Sapir-LOCKED copy.
  // (Its low_carb sibling was withdrawn in MEH-2047 — see the header note.)
  no_added_sugar: {
    key: "no_added_sugar",
    label: "ללא סוכר מוסף",
    tooltip: "לעסק יש מוצרים ללא סוכר מוסף מסומנים בקטלוג.",
    color: "muted",
  },
  kosher: {
    key: "kosher",
    // MEH-1711: "כשר" was our own synthesized label — the bare word claims a
    // kashrut standard without naming which one, the over-claim MEH-1418
    // already rejected once for the filter chip (attribute-labels.js:61,
    // Sapir-LOCKED per MEH-1087) without taking the badge in the same round.
    // This is now the FALLBACK only: BadgeRow resolves the actual certification
    // name ("חלק", "בדצ״ה", …) from producer.kashrut_badges when there is
    // exactly one code, and falls back to this string on zero or 2+ codes —
    // where naming a single certificate would itself be a misstatement.
    // Industry precedent: ACM/Booking.com 2024 — the objection was to the
    // self-synthesized label, and the remedy was naming the third-party
    // certification instead. Hardcoded Hebrew matches every sibling entry in
    // this file; no new i18n key, so the MEH-978 en-parity guard is untouched.
    label: "כשרות מאומתת",
    tooltip: "המוצרים תחת השגחת כשרות.",
    color: "muted",
  },
  delivery: {
    key: "delivery",
    label: "משלוח",
    tooltip: "העסק מוסר או שולח לכתובת שלך.",
    color: "muted",
  },
  // MEH-1846: the products badge is REMOVED. It lit on products_count >= 3,
  // which is true for effectively every approved business — manual approval
  // means a business with no catalog is not live — so it differentiated
  // nothing and diluted the badges that do (trust inflation: 3 targeted
  // signals beat 7 diffuse ones). MEH-1124 had already hidden it from
  // ProducerHeader as information-class noise; this completes that decision
  // across every surface. Catalog richness is still communicated by the card's
  // price label + description and the detail page's products section, and the
  // nudge to fill a catalog belongs to ProfileCompletenessCard, not to a
  // consumer-facing badge. producer.products_count is UNCHANGED — it is a
  // data field with non-badge consumers (ProfileCompletenessCard.jsx:141).
};

// Priority order — left = highest. Exposed for tests.
// MEH-1492: recommended ("בחירת העורכת") drops BELOW license — a regulatory
// fact (Ministry of Health licence) outranks an editorial opinion.
export const BADGE_PRIORITY = [
  "verified",
  "license",
  "recommended",
  "new",
  // MEH-1259: "organic" removed — see BADGE_CONFIG note above.
  "grass_fed",
  "gluten_free",
  "vegetarian",
  "vegan",
  "lactose_free",
  // MEH-1934: allBadges() iterates THIS array, not BADGE_CONFIG — a badge
  // defined in the config but missing here is silently never rendered. The
  // `toHaveLength` pin in badges.test.js is what catches that, and it caught
  // exactly this omission during MEH-1934.
  "no_added_sugar",
  "kosher",
  "delivery",
  // MEH-1846: products removed — see the BADGE_CONFIG note above.
];

const NEW_DAYS = 30;

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
    // MEH-1934: a plain aggregate. Unlike vegetarian (which folds in is_vegan),
    // it is not implied by any other axis.
    case "no_added_sugar":
      return !!producer.has_no_added_sugar_products;
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
      // MEH-1841 — specific supersedes generic. A delivery-only business
      // already carries the "משלוחים בלבד" pill on ProducerCard
      // (ProducerCard.jsx:382), so the generic "משלוח" badge sat next to it
      // saying strictly less about the same fact — two delivery chips on one
      // card. Suppressed here, at the derivation layer, so EVERY consumer
      // stays consistent: the card's top-2 row, the `+N` overflow popover
      // (which reads allBadges().slice(2)), and badgeCount which drives that
      // `+N`. Display-only — the ?delivery=true listing filter is a backend
      // query and is untouched.
      //
      // Gated on BOTH fields, mirroring the pill's condition verbatim, so the
      // generic badge yields only where the specific one actually renders.
      // (has_physical_location=false, offers_delivery=false) is rejected by the
      // owner form (ProducerForm.jsx:1047) and by the backend model
      // (schemas/schemas.py:1262) — but should a legacy row reach a card in
      // that state, the pill does not render, and suppressing here too would
      // leave it with no delivery indication at all.
      if (producer.has_physical_location === false && producer.offers_delivery) {
        return false;
      }
      return (
        !!producer.has_delivery ||
        (typeof producer.delivery_count === "number" &&
          producer.delivery_count > 0)
      );
    // MEH-1846: no products case — the badge is removed. producer.products_count
    // stays on the payload and keeps its non-badge consumers; it simply drives
    // no badge, the same shape MEH-1259 used to retire "organic".
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
