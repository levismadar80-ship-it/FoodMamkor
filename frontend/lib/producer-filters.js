// MEH-657: dietary/trust chips are text-only (Emoji LOCK v2 / a11y) — no icon glyphs.
export const CHIPS_CONFIG = [
  { key: "kosher",        label: "כשר" },
  { key: "organic",       label: "אורגני" },
  { key: "gluten_free",   label: "ללא גלוטן" },
  { key: "vegan",         label: "טבעוני" },
  { key: "lactose_free",  label: "ללא לקטוז" },
  { key: "has_delivery",  label: "משלוח" },
  { key: "verified",      label: "מאומת בלבד" },
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
