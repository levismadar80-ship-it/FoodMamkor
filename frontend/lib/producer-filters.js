// MEH-1418: attribute chips now carry Phosphor LEADING ICONS (lib/chip-icons.js,
// threaded at the render call site via withChipIcons). Labels stay text-only —
// Emoji LOCK v2 forbids emoji literals; aria-hidden Phosphor glyphs are the
// approved substitute (MEH-990 precedent).
// MEH-1082: shared attribute labels come from ATTRIBUTE_LABELS (unified with the
// /map TOGGLE_CHIPS). MEH-1418: `kosher` joined the shared map ("כשרות מאומתת",
// MEH-1087) — the /producers "כשר" label is retired.
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";

export const CHIPS_CONFIG = [
  { key: "kosher",        label: ATTRIBUTE_LABELS.kosher },
  // MEH-1259: organic chip removed — self-declared organic is no longer a
  // public filter/badge (חוק תוצרת אורגנית 2005). Field + owner toggle kept.
  // MEH-1438: diet-group order locked to טבעוני · צמחוני · ללא גלוטן · ללא לקטוז
  // (vegetarian sits next to vegan — a vegan product is vegetarian by definition).
  { key: "vegan",         label: ATTRIBUTE_LABELS.vegan },
  { key: "vegetarian",    label: ATTRIBUTE_LABELS.vegetarian },
  { key: "gluten_free",   label: ATTRIBUTE_LABELS.gluten_free },
  { key: "lactose_free",  label: ATTRIBUTE_LABELS.lactose_free },
  { key: "has_delivery",  label: ATTRIBUTE_LABELS.has_delivery },
  { key: "verified",      label: ATTRIBUTE_LABELS.verified },
];

export const CHIPS_DEFAULT = {
  kosher: false,
  vegan: false,
  vegetarian: false,
  gluten_free: false,
  lactose_free: false,
  has_delivery: false,
  verified: false,
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
  return p;
}
