// MEH-657: dietary/trust chips are text-only (Emoji LOCK v2 / a11y) — no icon glyphs.
// MEH-1082: shared attribute labels come from ATTRIBUTE_LABELS (unified with the
// /map TOGGLE_CHIPS); `kosher` is /producers-only so its label stays local.
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";

export const CHIPS_CONFIG = [
  { key: "kosher",        label: "כשר" },
  { key: "organic",       label: ATTRIBUTE_LABELS.organic },
  { key: "gluten_free",   label: ATTRIBUTE_LABELS.gluten_free },
  { key: "vegan",         label: ATTRIBUTE_LABELS.vegan },
  { key: "lactose_free",  label: ATTRIBUTE_LABELS.lactose_free },
  { key: "has_delivery",  label: ATTRIBUTE_LABELS.has_delivery },
  { key: "verified",      label: ATTRIBUTE_LABELS.verified },
];

export const CHIPS_DEFAULT = {
  kosher: false,
  organic: false,
  gluten_free: false,
  vegan: false,
  lactose_free: false,
  has_delivery: false,
  verified: false,
};

export function buildChipParams(chips, overrides = {}) {
  const c = { ...chips, ...overrides };
  const p = {};
  if (c.kosher) p.kosher = true;
  if (c.organic) p.organic = true;
  if (c.gluten_free) p.gluten_free = true;
  if (c.vegan) p.vegan = true;
  if (c.lactose_free) p.lactose_free = true;
  if (c.has_delivery) p.has_delivery = true;
  if (c.verified) p.verified = true;
  return p;
}
