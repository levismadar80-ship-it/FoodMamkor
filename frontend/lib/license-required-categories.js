// @ts-check
/**
 * MEH-530: client-side copy of backend/app/constants.py
 * LICENSE_REQUIRED_CATEGORIES (Hebrew category NAMES).
 *
 * MEH-3255: the source of truth is each category's own `requires_license`
 * (the categories payload carries it). `requiresProducerLicense` reads that
 * boolean first; this name list is only the fallback for a payload without
 * it, and on the server it only seeds the column.
 *
 * Frontend uses these to:
 *   1. Switch the license input between "required" and "optional toggle" UI.
 *   2. Show the helper text "ייצור מזון בקטגוריה זו דורש רישיון יצרן".
 *
 * Backend enforcement runs through ensure_license_for_categories regardless —
 * this lib is purely a UX nudge, never a security check.
 */
export const LICENSE_REQUIRED_CATEGORIES = [
  "לחמים ואפייה",
  "מותססים וכבושים",
  "מוצרים מוכנים",
  // MEH-927: "בשר ודגים" split into "בשר" + "דגים"; both animal-source food →
  // both license-required (mirror of backend/app/constants.py).
  "בשר",
  "דגים",
  "חלב וגבינות",
  "שוקולד וממתקים בוטיק",
  "יין, בירה ומשקאות",
  // MEH-743: honey split off from "שמנים ודבש" — keeper + marketing
  // licenses required by צו הפיקוח, תשל"ז-1977. "שמנים" alone stays optional.
  "דבש",
];

// MEH-530: client mirror of PRODUCER_LICENSE_REGEX. Used for the inline
// format warning — never blocks submit (manual-approval flow).
export const PRODUCER_LICENSE_REGEX = /^\d{7,10}$/;

/**
 * MEH-3255 (D10): every category the API serves carries its own answer,
 * `requires_license`, set when the category was created — so one an admin
 * adds is no longer silently "optional" here. The name list is only the
 * fallback for a category object that does not carry the field.
 *
 * @param {Array<{id: number, name: string, requires_license?: boolean}>} allCategories — full category list (from GET /categories)
 * @param {Array<number>} selectedIds — currently selected category IDs
 * @returns {boolean} — true if any selected category requires a licence
 */
export function requiresProducerLicense(allCategories, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) return false;
  return allCategories
    .filter((c) => selectedIds.includes(c.id))
    .some((c) =>
      typeof c.requires_license === "boolean"
        ? c.requires_license
        : LICENSE_REQUIRED_CATEGORIES.includes(c.name),
    );
}

/**
 * @param {string} value — current license input value
 * @returns {boolean} — true if non-empty AND doesn't match the regex (caller
 *   uses this to render the inline warning text). Empty/whitespace-only is
 *   treated as "no value entered yet" (no warning).
 */
export function hasLicenseFormatWarning(value) {
  const trimmed = (value || "").trim();
  if (trimmed === "") return false;
  return !PRODUCER_LICENSE_REGEX.test(trimmed);
}
