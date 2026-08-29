/**
 * Badge system (MEH-18). Pure functions — no React, no DOM.
 *
 * Badges (Phase B fold, April 2026):
 *   verified     (manual)  — producer.verification_tier === "verified"   (MEH-762; ADR-022 tier — replaced the legacy admin-verified flag)
 *   recommended  (manual)  — producer.is_recommended
 *   (license REMOVED — MEH-2213: the licence number is typed by the business
 *    and sits beside the ADR-022 verified seal, the admin-checked signal for
 *    the same fact. The field is still served and still drives owner/admin
 *    surfaces; it simply lights no badge.)
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
 *   verified > recommended > new > grass_fed > gluten_free > vegetarian > vegan > lactose_free > no_added_sugar > kosher > delivery
 *   (MEH-1934: the two new diet badges join the diet run, after lactose_free.
 *    They therefore outrank kosher and delivery, which is how every other diet
 *    badge already sits — consistency with the existing group, not a claim
 *    that a self-declared diet marking matters more than a verified kashrut
 *    certificate. Worth revisiting if the diet run keeps growing, since only
 *    the top 2 reach a card.)
 *
 * ProducerCard renders the top-priority 2 with `topBadges(producer, 2)`.
 * ProducerDetail renders everything with `allBadges(producer)`.
 *
 * MEH-1753 — Label Scope Contract (.claude/rules/labels.md). Every entry
 * declares TWO fields beyond its rendered copy:
 *   - scope    ∈ business | any-product | facility — WHAT the label applies to.
 *   - evidence ∈ self-declared | admin-verified | editorial | system — WHO
 *                established it.
 * A badge is a label in exactly the contract's sense: a term attached to a
 * business as a claim about it. The four precedents the contract encodes
 * (MEH-986 kosher · MEH-1259 organic · MEH-1439 diet tooltips · MEH-1492
 * editor's pick) are ALL badge incidents, so BADGE_CONFIG was the one label
 * surface still outside the rule that its own history wrote.
 *
 * This is METADATA ONLY. No rendered string changes, and none may: the fields
 * are inert at render time and `LabelScopeContract.test.js` asserts the full
 * label set is byte-identical.
 *
 * NINE of these keys also exist as filter axes in lib/filter-taxonomy.js
 * (eight by the same key, plus `delivery` <-> `has_delivery`). Their scope and
 * evidence are NOT hand-copied here in the sense that matters: an equality
 * assertion in LabelScopeContract.test.js requires each pair to agree, so a
 * change to one side without the other goes red.
 *
 * MEH-2214 corrects what this paragraph used to say next. It read: "They are
 * declared rather than imported because the LABELS legitimately differ -- the
 * `verified` badge reads "מאומת" while its axis reads "רישוי מאומת"." That was
 * true when written and is now false, and `verified` was the LAST pair it was
 * true of: measured across all nine, the other eight already agreed
 * character-for-character, so today every pair does.
 *
 * The guard still does not compare labels, and that is now a deliberate
 * ALLOWANCE rather than a description of the state. The contract governs what
 * a label CLAIMS (scope) and WHO established it (evidence); copy is a separate
 * decision, and a future axis may legitimately need wording a badge does not.
 * Asserting equality would freeze that door shut, so it stays open on purpose
 * -- not because anything currently differs.
 */

export const BADGE_CONFIG = {
  verified: {
    key: "verified",
    // Matches FILTER_AXES.verified. An admin checked a licence or exemption
    // document against the Ministry of Health register (ADR-022).
    scope: "business",
    evidence: "admin-verified",
    label: "מאומת",
    // MEH-762: ADR-022 tier-1 copy lock (terms §5.2-aligned). Replaces the
    // pre-ADR-022 over-claim ("עבר אימות זהות ורישוי"). en gap is inherited
    // legacy — dies when MEH-76 S12 wires the MEH-758 keys.
    tooltip: "בית העסק הציג מסמך רישוי או אישור פטור רשמי שנבדק ידנית.",
    color: "primary",
  },
  recommended: {
    key: "recommended",
    // The 4th evidence value, added by MEH-1753. `recommended` is neither
    // self-declared (the owner cannot set it) nor admin-verified (nothing is
    // checked against an external register) — it is an editor's opinion, and
    // ADR-030 bans buying it. Filing it under either existing value would have
    // been the MEH-1492 over-claim again: "admin-verified" reads as an earned
    // status. scope is `business` — it is the whole business being chosen.
    scope: "business",
    evidence: "editorial",
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
  // MEH-2213: the "license" badge is REMOVED from every reader surface. It was
  // fed by the licence number the business types at registration (MEH-530) and
  // sat beside the ADR-022 verified seal — the admin-checked signal for the same
  // fact. On a business carrying both, the two claims consumed both visible card
  // slots (v4 LOCK max 2) and pushed kashrut into the "+N". The field is
  // unchanged on the API contract, in lib/schemas.js and on every owner/admin
  // surface; it simply lights no badge, the shape MEH-1259 used to retire
  // "organic" and MEH-1846 used to retire "products".

  new: {
    key: "new",
    // The first live use of `system`, which labels.md reserved and left with
    // no example. Nobody asserts this and nobody verifies it: it is computed
    // from `days_since_created` (:225), which is what `system` was reserved
    // for. scope is `business` — the business joined recently, not a product.
    scope: "business",
    evidence: "system",
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
    // Matches FILTER_AXES.grass_fed. scope is `business`, NOT `any-product`:
    // it reads off `producer.grass_fed` (:234), a whole-business marking, and
    // is the one non-diet member of the self-declared group.
    scope: "business",
    evidence: "self-declared",
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
    // Matches FILTER_AXES.gluten_free. `any-product`, never `business`: the
    // badge lights on `has_gluten_free_products` — ANY marked product in the
    // catalog (MEH-479). Reading it as a whole-business property is the exact
    // MEH-1439 over-claim, and the tooltip below is worded to prevent it.
    scope: "any-product",
    evidence: "self-declared",
    label: "ללא גלוטן",
    tooltip: "לעסק יש מוצרים ללא גלוטן מסומנים בקטלוג.",
    color: "muted",
  },
  // MEH-1438: vegetarian badge — lights on has_vegetarian_products (aggregation
  // counts is_vegan too, since a vegan product is vegetarian). Priority sits
  // after gluten_free, before vegan.
  vegetarian: {
    key: "vegetarian",
    // Matches FILTER_AXES.vegetarian. `any-product`, never `business`: the
    // badge lights on `has_vegetarian_products` — ANY marked product in the
    // catalog (MEH-479). Reading it as a whole-business property is the exact
    // MEH-1439 over-claim, and the tooltip below is worded to prevent it.
    scope: "any-product",
    evidence: "self-declared",
    label: "צמחוני",
    tooltip: "לעסק יש מוצרים צמחוניים מסומנים בקטלוג.",
    color: "muted",
  },
  vegan: {
    key: "vegan",
    // Matches FILTER_AXES.vegan. `any-product`, never `business`: the
    // badge lights on `has_vegan_products` — ANY marked product in the
    // catalog (MEH-479). Reading it as a whole-business property is the exact
    // MEH-1439 over-claim, and the tooltip below is worded to prevent it.
    scope: "any-product",
    evidence: "self-declared",
    label: "טבעוני",
    tooltip: "לעסק יש מוצרים טבעוניים מסומנים בקטלוג.",
    color: "muted",
  },
  lactose_free: {
    key: "lactose_free",
    // Matches FILTER_AXES.lactose_free. `any-product`, never `business`: the
    // badge lights on `has_lactose_free_products` — ANY marked product in the
    // catalog (MEH-479). Reading it as a whole-business property is the exact
    // MEH-1439 over-claim, and the tooltip below is worded to prevent it.
    scope: "any-product",
    evidence: "self-declared",
    label: "ללא לקטוז",
    tooltip: "לעסק יש מוצרים ללא לקטוז מסומנים בקטלוג.",
    color: "muted",
  },
  // MEH-1934: tooltip carries any-product semantics (MEH-1439) — "לעסק יש
  // מוצרים … מסומנים בקטלוג", never a whole-business claim. Sapir-LOCKED copy.
  // (Its low_carb sibling was withdrawn in MEH-2047 — see the header note.)
  no_added_sugar: {
    key: "no_added_sugar",
    // Matches FILTER_AXES.no_added_sugar. `any-product`, never `business`: the
    // badge lights on `has_no_added_sugar_products` — ANY marked product in the
    // catalog (MEH-479). Reading it as a whole-business property is the exact
    // MEH-1439 over-claim, and the tooltip below is worded to prevent it.
    scope: "any-product",
    evidence: "self-declared",
    label: "ללא סוכר מוסף",
    tooltip: "לעסק יש מוצרים ללא סוכר מוסף מסומנים בקטלוג.",
    color: "muted",
  },
  kosher: {
    key: "kosher",
    // Matches FILTER_AXES.kosher. STATIC, and deliberately so: MEH-1711 makes
    // the LABEL dynamic (resolveBadgeLabel names the actual certification when
    // there is exactly one code, else falls back to the string below), but the
    // claim's scope and evidence are invariant across every branch of that
    // resolution — an admin stamped `kashrut_verified_at` either way (MEH-986,
    // expiry-enforced MEH-1260). Metadata that varied with the rendered string
    // would be describing the copy, not the claim.
    scope: "business",
    evidence: "admin-verified",
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
    // Same CLAIM as FILTER_AXES.has_delivery — same label ("משלוח"), same
    // scope, same evidence — under a different KEY, which is why the equality
    // guard maps the pair explicitly. The PREDICATES differ (the badge also
    // counts `delivery_count > 0` and is suppressed for a delivery-only
    // business, MEH-1841) and that is fine: the contract governs what the
    // label claims and who established it, not how the boolean is computed.
    scope: "business",
    evidence: "self-declared",
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
// MEH-2213: "license" left this list with its BADGE_CONFIG entry. MEH-1492's
// ordering rule (a regulatory fact outranks an editorial opinion) is what put
// it above "recommended"; with the badge gone the rule has nothing left to
// order here, and "recommended" now follows "verified" directly.
export const BADGE_PRIORITY = [
  "verified",
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
      // MEH-2046: reads the server-computed `delivers`, which IS the result of
      // producer_listing._has_delivery_condition(). It replaces
      // `has_delivery || delivery_count > 0` — a heuristic that had drifted
      // from the filter it was meant to reflect. `has_delivery` is a legacy
      // column no delivery predicate consults (producer_import.py:311-312), and
      // `delivery_count` counts delivery_areas rows, of which a NATIONWIDE
      // business has none. So a business that delivers everywhere passed the
      // delivery filter and rendered no delivery badge — MEH-1836's divergence,
      // reaching the user as a card that says nothing about the very axis they
      // filtered on. Do not reintroduce either operand as a fallback: a
      // fallback would restore the drift for exactly the rows that need it
      // least, and `delivers` is false only when the business genuinely does
      // not deliver.
      return !!producer.delivers;
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
