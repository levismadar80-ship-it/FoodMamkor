// MEH-1418: attribute chips now carry Phosphor LEADING ICONS (lib/chip-icons.js,
// threaded at the render call site via withChipIcons). Labels stay text-only —
// Emoji LOCK v2 forbids emoji literals; aria-hidden Phosphor glyphs are the
// approved substitute (MEH-990 precedent).
// MEH-1082: shared attribute labels come from ATTRIBUTE_LABELS (unified with the
// /map TOGGLE_CHIPS). MEH-1418: `kosher` joined the shared map ("כשרות מאומתת",
// MEH-1087) — the /producers "כשר" label is retired.
// MEH-1507: each ATTRIBUTE_LABELS entry is now an object {label, scope, evidence,
// subtext}; spreading it into a chip keeps `chip.label` a string (chip row
// unchanged) while carrying the scope×evidence metadata the contract guard
// (LabelScopeContract.test.js) requires on every entry.
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";

// MEH-1881: /producers-local, mirroring how map-chips.js:76 keeps its /map-only
// `grass_fed` object out of the shared map. ATTRIBUTE_LABELS is for keys BOTH
// surfaces render, and /map is explicitly out of this ticket's scope — putting
// it there breaks the attributeLabels parity test, which is exactly the promise
// that map is supposed to enforce.
//
// business scope — the window belongs to the whole business, not to a product
// or a facility. self-declared evidence — nobody checks that she actually
// answers, which is why the subtext says "שהגדירו" and not "זמינים עכשיו"
// (MEH-1652 copy-honesty: describe the declared mechanic, never promise on the
// business's behalf).
const OPEN_NOW_LABEL = {
  label: "פתוח להזמנות עכשיו",
  scope: "business",
  evidence: "self-declared",
  subtext: "עסקים שחלון ההזמנות שהגדירו פתוח ברגע זה",
};

export const CHIPS_CONFIG = [
  { key: "kosher",        ...ATTRIBUTE_LABELS.kosher },
  // MEH-1259: organic chip removed — self-declared organic is no longer a
  // public filter/badge (חוק תוצרת אורגנית 2005). Field + owner toggle kept.
  // MEH-1438: diet-group order locked to טבעוני · צמחוני · ללא גלוטן · ללא לקטוז
  // (vegetarian sits next to vegan — a vegan product is vegetarian by definition).
  { key: "vegan",         ...ATTRIBUTE_LABELS.vegan },
  { key: "vegetarian",    ...ATTRIBUTE_LABELS.vegetarian },
  { key: "gluten_free",   ...ATTRIBUTE_LABELS.gluten_free },
  { key: "lactose_free",  ...ATTRIBUTE_LABELS.lactose_free },
  { key: "has_delivery",  ...ATTRIBUTE_LABELS.has_delivery },
  { key: "verified",      ...ATTRIBUTE_LABELS.verified },
];

// MEH-1881: the chip stays out of the DOM until at least this many loaded
// producers have declared a window. A filter that returns an empty list
// looks broken AND punishes the businesses that joined first — before the
// catalog has the data, the honest thing is not to offer the filter.
// Deliberately a runtime data gate, not a flag: the feature turns itself on
// when the data arrives, with nobody remembering to flip anything.
export const OPEN_NOW_CHIP_MIN = 5;

export const CHIPS_DEFAULT = {
  kosher: false,
  vegan: false,
  vegetarian: false,
  gluten_free: false,
  lactose_free: false,
  has_delivery: false,
  verified: false,
};

// MEH-1881: /producers gets an EIGHTH chip; the home grid does not.
//
// `CHIPS_CONFIG` is shared — HomeProducersGrid.jsx:70 renders the same array —
// so appending there put the chip on the home page too, ungated, on a surface
// this ticket puts explicitly out of scope. The `toHaveLength(7)` pin in
// useHomePageDietChipsUrl.test.js is what caught it; without that one number
// the leak would have shipped looking like a feature.
//
// Last in the row on purpose: it is the only chip whose answer changes by the
// hour, so it reads as a refinement of the durable attributes above rather than
// as a peer of them.
export const PRODUCERS_CHIPS_CONFIG = [
  ...CHIPS_CONFIG,
  { key: "open_for_orders_now", ...OPEN_NOW_LABEL },
];

export const PRODUCERS_CHIPS_DEFAULT = {
  ...CHIPS_DEFAULT,
  open_for_orders_now: false,
};

export function buildChipParams(chips, overrides = {}) {
  const c = { ...chips, ...overrides };
  const p = {};
  if (c.kosher) p.kosher = true;
  if (c.gluten_free) p.gluten_free = true;
  if (c.vegan) p.vegan = true;
  if (c.vegetarian) p.vegetarian = true;  // MEH-1438
  if (c.lactose_free) p.lactose_free = true;
  if (c.has_delivery) p.has_delivery = true;
  if (c.verified) p.verified = true;
  if (c.open_for_orders_now) p.open_for_orders_now = true;  // MEH-1881
  return p;
}
