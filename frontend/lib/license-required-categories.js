/**
 * MEH-530: client-side mirror of backend/app/constants.py
 * LICENSE_REQUIRED_CATEGORIES. The values are Hebrew category NAMES so the
 * mirror survives seed reorders (category IDs are seed-ordering-dependent).
 *
 * Source of truth: backend/app/constants.py:LICENSE_REQUIRED_CATEGORIES.
 * Any change there MUST be mirrored here, otherwise the UI will say
 * "optional" while the backend 422s on submit.
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
  "בשר ודגים",
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
 * @param {Array<{id: number, name: string}>} allCategories — full category list (from GET /categories)
 * @param {Array<number>} selectedIds — currently selected category IDs
 * @returns {boolean} — true if any selected category name is in LICENSE_REQUIRED_CATEGORIES
 */
export function requiresProducerLicense(allCategories, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) return false;
  const selectedNames = new Set(
    allCategories.filter((c) => selectedIds.includes(c.id)).map((c) => c.name),
  );
  return LICENSE_REQUIRED_CATEGORIES.some((name) => selectedNames.has(name));
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
