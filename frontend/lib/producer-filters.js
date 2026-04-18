export const CHIPS_CONFIG = [
  { key: "kosher",       label: "כשר",        icon: "✡️" },
  { key: "organic",      label: "אורגני",      icon: "🌿" },
  { key: "has_delivery", label: "משלוח",       icon: "🚚" },
  { key: "verified",     label: "מאומת בלבד",  icon: "✅" },
];

export const CHIPS_DEFAULT = {
  kosher: false,
  organic: false,
  has_delivery: false,
  verified: false,
};

export function buildChipParams(chips, overrides = {}) {
  const c = { ...chips, ...overrides };
  const p = {};
  if (c.kosher) p.kosher = true;
  if (c.organic) p.organic = true;
  if (c.has_delivery) p.has_delivery = true;
  if (c.verified) p.verified = true;
  return p;
}
