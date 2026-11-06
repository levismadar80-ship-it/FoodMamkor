/**
 * Module:   filter-taxonomy
 * Purpose:  MEH-2130 — THE single definition of every consumer filter axis.
 *           One object per axis carrying its key, consumer label, Label Scope
 *           Contract metadata (scope × evidence × subtext), FilterSheet group,
 *           the surfaces that offer it, and the URL-param name each surface
 *           uses. Every other module derives; none re-declares.
 * Touches:  nothing — a React-free, DOM-free data module (same discipline as
 *           attribute-labels.js / map-chips.js, so pure-logic tests can import
 *           it without a renderer).
 * Does NOT: render anything, own chip ICONS (lib/chip-icons.js), own
 *           presentation ORDER inside a FilterSheet group (FilterSheet.jsx
 *           GROUP_CHIP_ORDER), or own category chips (lib/map-chips.js
 *           CATEGORY_CHIPS — a different axis type entirely, MEH-1181 LOCK).
 * Related:  lib/attribute-labels.js · lib/producer-filters.js ·
 *           lib/map-chips.js · lib/use-home-page.js ·
 *           components/ProducersClient.jsx ·
 *           app/[locale]/map/components/ServiceChipRow.jsx
 * History:  MEH-2130 (creation).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Before this, one axis was declared in up to six places: its label in
 * ATTRIBUTE_LABELS, its surface membership in CHIPS_CONFIG *and* TOGGLE_CHIPS,
 * its group in PRODUCERS_CHIP_GROUPS *and* TOGGLE_CHIPS, and its URL param in
 * three hand-written serializers (buildChipParams, chipStateToParams,
 * use-home-page's initChips/updateURL pair). Nothing cross-checked them, so
 * they drifted — twice, measurably, and in the same direction each time:
 *
 *   - `pickup_points` (MEH-2046) reached /map only, though the backend filter
 *     `?pickup_points=true` is public and global (producers.py:136). A consumer
 *     saw "איסוף עצמי" on the map and nowhere else.
 *   - `no_added_sugar` (MEH-1934) reached CHIPS_CONFIG and TOGGLE_CHIPS but was
 *     never added to home's hydration/serialization pair, so the home chip's
 *     URL state could not round-trip. The identical omission MEH-1083 had
 *     already fixed once for the diet keys.
 *
 * Both are the shape MEH-1825 named for `?day=` vs `?delivery_day=`: two names
 * (or two membership lists) for one axis, caught by no gate. Deriving removes
 * the drift by construction — there is no second list left to disagree.
 *
 * ORDER IS DELIBERATELY NOT MEMBERSHIP.
 * `surfaces` decides WHETHER an axis appears; the *_CHIP_ORDER arrays below
 * decide WHERE in the row. They are separate because the two surfaces
 * genuinely order the same set differently (/map leads with the service pair,
 * the listing leads with quality+diet), and folding order into the axis would
 * force one surface to lie. `filterTaxonomy.test.js` asserts each order array
 * is an exact permutation of the membership it sorts, so an axis added here
 * without an order entry fails a test instead of silently sorting last.
 */

/**
 * Every axis, keyed by its canonical key.
 *
 * Field contract:
 *   key        — implicit (the object key). ALSO the /producers URL param name
 *                and the deep-link param home emits in navigateToChip.
 *   label      — NOT stored here (MEH-2748). The rendered consumer string lives
 *                in messages/{he,en}.json `filter_axes.<key>.label` and is
 *                attached at render time by lib/use-chip-copy.js. Text-only
 *                (Emoji-LOCK v2; the Phosphor leading glyph comes from
 *                lib/chip-icons.js).
 *   scope      — business | any-product | facility (.claude/rules/labels.md).
 *   evidence   — self-declared | admin-verified | system.
 *   hasSubtext — whether `filter_axes.<key>.subtext` exists in messages. When
 *                false the FilterSheet falls back to a BADGE_CONFIG tooltip
 *                (kosher · verified). All Hebrew copy is Sapir-LOCKED by its
 *                originating ticket — moved VERBATIM to he.json by MEH-2748.
 *   group      — FilterSheet section: diet | quality | service.
 *   surfaces   — subset of ["home", "producers", "map"]. This is the ONLY
 *                membership declaration in the repo.
 *   homeParam  — home's own URL param name when it differs from `key`. Present
 *                on exactly one axis (see has_delivery). Absent ⇒ `key`.
 *   mapParam   — false when /map deliberately emits NO param for this axis.
 *                Present on exactly one axis, and it marks a DEFECT, not a
 *                design choice (see no_added_sugar).
 */
export const FILTER_AXES = {
  // ── service ────────────────────────────────────────────────────────────
  // MEH-1082. Owner-toggled business property; no external check.
  has_delivery: {
    scope: "business",
    evidence: "self-declared",
    hasSubtext: false,
    group: "service",
    surfaces: ["home", "producers", "map"],
    // home writes and reads the legacy short name `?delivery=1`
    // (use-home-page updateURL / mount hydration). It predates the chip key
    // and is NOT renamed here: URL-param renames are explicitly out of
    // MEH-2130's scope, and a rename would break every bookmarked home URL.
    // The /producers deep-link still emits `?has_delivery=1` — navigateToChip
    // uses /producers' names on purpose (MEH-1826), and the
    // useHomePageDietChipsUrl suite pins exactly that asymmetry.
    homeParam: "delivery",
  },
  // MEH-2046 label + scope reasoning, MEH-1461 locked consumer string.
  // MEH-2130 promotes it from /map-local to all three surfaces: the backend
  // filter is public and global (`?pickup_points=true`, producers.py:136 →
  // producer_listing._pickup_condition), so the axis was never map-shaped —
  // only its config placement was.
  //
  // The subtext is load-bearing, not decoration: the predicate is an EXISTS
  // over the business's pickup AND market_stand location rows, which "איסוף
  // עצמי" alone does not tell a reader. Stopping that quiet over-claim is what
  // the Label Scope Contract is for.
  pickup_points: {
    scope: "business",
    evidence: "self-declared",
    hasSubtext: true,
    group: "service",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-2598: the third service axis, the filter twin of the map card's
  // «קנייה במקום» tag (lib/fulfillmentTags.js). Backend `?on_site=true` →
  // producer_listing._on_site_condition: a physical store with stated opening
  // hours. The subtext names that, because "קנייה במקום" alone does not say
  // the hours are what qualify a business.
  on_site: {
    scope: "business",
    evidence: "self-declared",
    hasSubtext: true,
    group: "service",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-1418 named WHAT was verified — a license or exemption document checked
  // by an admin against the Ministry of Health registry (ADR-022) — and the
  // longer phrasing carried that.
  //
  // MEH-2214 shortens it to match the badge and the seal. The axis is the same
  // claim on all three, so three names for it made the filter read as a fourth
  // thing a business could be. What MEH-1418 was protecting is unchanged: the
  // FilterSheet row still explains WHAT was checked, via BADGE_CONFIG.verified
  // .tooltip (see subtext below), which is where that sentence belongs.
  verified: {
    scope: "business",
    evidence: "admin-verified",
    hasSubtext: false, // FilterSheet uses BADGE_CONFIG.verified.tooltip
    group: "service",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-1881 wired the backend filter and put the chip on /producers only,
  // because that ticket scoped the other two surfaces out. MEH-2131 widens it:
  // "open now" is the highest-intent filter a directory has (HappyCow, Google
  // Maps), the predicate has been public and correct since MEH-1881, and after
  // MEH-2130 exposing it everywhere is one field rather than three edits.
  //
  // Copy is Sapir-LOCKED 19/08 (MEH-2131) and is the PLURAL form — it changed
  // from MEH-1881's singular "פתוח להזמנות עכשיו", matching how every other
  // chip in the row reads as a property of the businesses being listed rather
  // than of one business. Do not revert it to the singular.
  //
  // The subtext says "שהגדירו" and not "זמינים עכשיו" because nobody checks
  // that she actually answers (MEH-1652 copy-honesty: describe the declared
  // mechanic, never promise on the business's behalf). That distinction is the
  // whole axis: `order_window` is when the owner said she takes WhatsApp
  // orders, NOT when a shop is staffed — `opening_hours` is the other fact and
  // this filter deliberately ignores it (producer_listing.py
  // _open_for_orders_now_condition).
  //
  // The window is evaluated SERVER-side in Asia/Jerusalem (`israel_now()`), so
  // a visitor abroad gets the same answer a local does and the frontend never
  // sends a time — only the boolean. See lib/producer-filters.js
  // `openNowChipVisible` for the one place the client looks at a clock, and
  // why that is a visibility decision rather than a second filter.
  open_for_orders_now: {
    scope: "business",
    evidence: "self-declared",
    hasSubtext: true,
    group: "service",
    surfaces: ["home", "producers", "map"],
  },

  // ── quality ────────────────────────────────────────────────────────────
  // MEH-1087 / MEH-1418. Sapir-LOCKED wording. Backend maps ?kosher=true to
  // kashrut_verified_at ONLY (producer_listing.py _kosher_condition), never the
  // free-text Producer.kosher — so this is admin-verified at business scope. A
  // FREE-TEXT kosher chip stays forbidden (חוק איסור הונאה בכשרות, MEH-986).
  kosher: {
    scope: "business",
    evidence: "admin-verified",
    hasSubtext: false, // FilterSheet uses BADGE_CONFIG.kosher.tooltip
    group: "quality",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-1507: /map-only. A producer-level boolean column (models.py grass_fed),
  // owner-declared. Its absence from the shared cross-surface set is what keeps
  // it off the listing surfaces — asserted by attributeLabels.test.js.
  grass_fed: {
    scope: "business",
    evidence: "self-declared",
    hasSubtext: true,
    group: "quality",
    surfaces: ["map"],
  },

  // ── diet ───────────────────────────────────────────────────────────────
  // MEH-293: every diet filter is an EXISTS subquery over PRODUCTS (at least
  // one matching product in the catalog), so its scope is any-product and NOT
  // the whole business — the exact over-claim MEH-1507 makes explicit, and the
  // MEH-1439 tooltip incident. Subtext copy LOCKED (MEH-1507 §hebrew_copy).
  //
  // MEH-1508 chunk 3ב-2 (card §6.6, LOCKED 23/07): the two partial axes carry
  // their scope IN THE TERM — «מתאים לטבעונים» / «מתאים לצמחונים» — because
  // the 100% pair below now sits beside them, and a bare «טבעוני» next to
  // «100% טבעוני» would leave the reader to infer that the unqualified word
  // means "partial". MEH-2677 then gave the bare word to the whole-business
  // axis («טבעוני» / «צמחוני»), the Deliveroo / Uber Eats pattern — which
  // only works because the partial axes keep «מתאים ל…». The card's research
  // (HappyCow / easy / NN/g / Baymard) rejected a tooltip or a second subtext for this: scope lives in the label.
  // Subtexts are unchanged (MEH-1507 lock).
  vegan: {
    scope: "any-product",
    evidence: "self-declared",
    hasSubtext: true,
    group: "diet",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-1438: a vegan product counts as vegetarian (?vegetarian matches
  // is_vegetarian OR is_vegan) — see badges.js.
  vegetarian: {
    scope: "any-product",
    evidence: "self-declared",
    hasSubtext: true,
    group: "diet",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-1508 chunk 3ב-2 — the 100% layer. A DIFFERENT CLAIM from the partial
  // axes above, not a stricter version of the same one: the backend answers
  // `?vegan_all=true` from `Producer.vegan_scope == 'all'` ALONE
  // (producer_listing._SCOPE_ALL_FILTERS, PR #3448), so a bakery with one vegan
  // cookie satisfies `vegan` and must NOT satisfy `vegan_all`. Hence scope
  // `business` (the owner declared it about everything she sells) and evidence
  // `self-declared` (admin approval cross-checks the catalog, but nothing is
  // verified against an external register — the MEH-1259 pattern, which is why
  // no checkmark glyph either, card §6.4). Label and subtext LOCKED (§6.4/§6.6).
  //
  // The key IS the backend param name, which is what makes every surface's
  // URL/param plumbing (buildChipParams · chipStateToParams · use-home-page ·
  // filter-url) carry it with no per-surface wiring.
  //
  // MEH-2677 (Sapir 05/11): no longer a filter chip on any surface
  // (`surfaces: []`) — one chip per diet; the declaration shows as the card
  // badge only. The backend param still exists. Gluten / lactose have NO 100% axis: their business
  // layer is a facility question (§2, §6.3), not a catalog one.
  vegan_all: {
    // MEH-2677 (Sapir 05/11): was «100% טבעוני» — readers did not parse the
    // percent. Deliveroo / Uber Eats / Yelp: one word for the whole business,
    // "… friendly" for partial (ours: «מתאים לטבעונים»).
    scope: "business",
    evidence: "self-declared",
    hasSubtext: true,
    group: "diet",
    surfaces: [], // MEH-2677 (Sapir 05/11): one filter chip per diet — card badge only
  },
  vegetarian_all: {
    // MEH-2677: was «100% צמחוני».
    scope: "business",
    evidence: "self-declared",
    hasSubtext: true,
    group: "diet",
    surfaces: [], // MEH-2677 (Sapir 05/11): one filter chip per diet — card badge only
  },
  gluten_free: {
    scope: "any-product",
    evidence: "self-declared",
    hasSubtext: true,
    group: "diet",
    surfaces: ["home", "producers", "map"],
  },
  lactose_free: {
    scope: "any-product",
    evidence: "self-declared",
    hasSubtext: true,
    group: "diet",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-1934: the fifth diet axis. Copy Sapir-LOCKED (MEH-1934 §hebrew_copy).
  // "מתאים לסוכרתיים" stays banned everywhere — a medical claim on top of a
  // self-declaration about a product.
  //
  // This axis carried `mapParam: false` from MEH-2130 until its own follow-up
  // ticket removed it. That flag was a PIN over a measured defect, never a
  // design choice:
  // before MEH-2130, chipStateToParams held nine hand-written
  // `if (state.<key>)` lines and `no_added_sugar` was not among them, while
  // TOGGLE_CHIPS listed the chip and FilterSheet rendered it — so toggling it
  // on /map returned the UNFILTERED set with no error anywhere. MEH-2130 was a
  // taxonomy refactor required to leave /map result sets identical, so it
  // declared the gap instead of quietly closing it inside a refactor, and said
  // a separate ticket would close it. That ticket is what removed the flag. The
  // axis now emits on all three surfaces, which is what the `surfaces` list
  // below has always promised.
  //
  // The pin was greppable by its own ticket identifier, and that identifier is
  // deliberately absent from this file now: a grep that still returns hits
  // cannot tell "the pin is live" from "someone wrote about the pin", which is
  // exactly the signal the pin existed to give.
  no_added_sugar: {
    scope: "any-product",
    evidence: "self-declared",
    hasSubtext: true,
    group: "diet",
    surfaces: ["home", "producers", "map"],
  },
  // MEH-1259 (organic) and MEH-2047 (דל פחמימות) were REMOVED from the public
  // taxonomy — a self-declared certificate claim and an undefined term
  // respectively. Their columns and stored values are kept; they are absent
  // here on purpose so neither can be re-surfaced by accident.
};

/**
 * Render order for the /map FilterSheet source array (TOGGLE_CHIPS).
 * Byte-identical to the pre-MEH-2130 hand-written array order — /map's rendered
 * output must not move. FilterSheet applies its own within-group presentation
 * order (GROUP_CHIP_ORDER) on top of this; that split predates MEH-2130.
 */
export const MAP_CHIP_ORDER = [
  "has_delivery",
  "pickup_points",
  "on_site", // MEH-2598
  "verified",
  "kosher",
  "grass_fed",
  "vegan",
  "vegetarian",
  "gluten_free",
  "lactose_free",
  "no_added_sugar",
  // MEH-2131: last in the /map array. FilterSheet's own GROUP_CHIP_ORDER
  // decides where it sits inside the service section (it is unenumerated
  // there, so it sorts after verified/has_delivery/pickup_points) — this
  // position only has to exist and be stable.
  "open_for_orders_now",
];

/**
 * Render order for the shared listing config (home row + /producers sheet).
 *
 * Pre-MEH-2130 order is preserved exactly, with `pickup_points` inserted
 * IMMEDIATELY AFTER `has_delivery` — the pair is the point of this ticket, and
 * a fulfillment axis separated from its twin by `verified` would read as two
 * unrelated filters. Same pairing /map's ServiceChipRow already shows.
 */
export const LISTING_CHIP_ORDER = [
  "kosher",
  "vegan",
  "vegetarian",
  "gluten_free",
  "lactose_free",
  "no_added_sugar",
  "has_delivery",
  "pickup_points",
  "on_site", // MEH-2598: completes the service trio
  "verified",
  // MEH-1881: last in the row on purpose — the only axis whose answer changes
  // by the hour, so it reads as a refinement of the durable attributes above
  // rather than as a peer of them. MEH-2131 widened its `surfaces` to all
  // three; this position is unchanged, and `surfaces` remains the only thing
  // that decides which surfaces render it.
  "open_for_orders_now",
];

/** Every axis key offered on `surface`, in `order`. */
export function axisKeysFor(surface, order) {
  const members = Object.keys(FILTER_AXES).filter((key) =>
    FILTER_AXES[key].surfaces.includes(surface),
  );
  const rank = (key) => {
    const i = order.indexOf(key);
    // An unranked key sorts last rather than to index -1 (which would jump it
    // to the FRONT). filterTaxonomy.test.js asserts this branch is unreachable
    // in production, so the fallback is a safety net and never the answer.
    return i === -1 ? order.length : i;
  };
  return members.sort((a, b) => rank(a) - rank(b));
}

/**
 * Chip objects for a key list: `{ key, scope, evidence, hasSubtext, group }`.
 * MEH-2748: no words here. A renderer passes the chip through `useChipCopy()`
 * (lib/use-chip-copy.js), which adds `label` and `subtext` from messages, so
 * `chip.label` is still a plain string at the render site and chip rows render
 * byte-identical in Hebrew (MEH-1507's constraint).
 *
 * `surfaces` / `homeParam` / `mapParam` are deliberately NOT copied onto the
 * chip: they are wiring, and a chip object is what a renderer receives.
 */
export function chipsForKeys(keys) {
  return keys.map((key) => {
    const { scope, evidence, hasSubtext, group } = FILTER_AXES[key];
    return { key, scope, evidence, hasSubtext, group };
  });
}

/** `{ key: false, … }` for a key list — the untouched-filters state. */
export function defaultsForKeys(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

/** The URL param name home uses for an axis (`?delivery=1` for has_delivery). */
export function homeParamFor(key) {
  return FILTER_AXES[key].homeParam ?? key;
}

/**
 * Whether /map emits a query param for an axis.
 *
 * No axis sets `mapParam: false` today — the only one that did was a pinned
 * defect rather than an intention, and it is fixed. The hook is kept because a
 * FUTURE axis may legitimately be display-only on /map; it is not kept as a
 * place to park a bug. Anything that lands here again needs the reason on the
 * axis and a test asserting the suppression is wanted.
 */
export function mapEmitsParam(key) {
  return FILTER_AXES[key].mapParam !== false;
}

/**
 * The CROSS-SURFACE axes — offered on all three discovery surfaces.
 *
 * This is what ATTRIBUTE_LABELS derives from, and membership in it is a PROMISE
 * that home, /producers and /map all render the axis with the same label
 * (attributeLabels.test.js turns that promise into a gate). `grass_fed` (/map)
 * and `open_for_orders_now` (/producers) are excluded by their own `surfaces`,
 * with no second list to keep in step.
 */
export const SHARED_AXIS_KEYS = Object.keys(FILTER_AXES).filter((key) => {
  const s = FILTER_AXES[key].surfaces;
  return s.includes("home") && s.includes("producers") && s.includes("map");
});
