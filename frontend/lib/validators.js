/**
 * Shared validators for form inputs across the site.
 * Used in /register, /register/producer, and anywhere phone/password
 * need client-side validation.
 */

/**
 * Israeli cell phone validator.
 * Accepts: 050-1234567 / 0501234567 / +972501234567
 * Prefixes allowed: 050-058 (5X), 072-079 (7X) — standard cell prefixes.
 */
export function validateIsraeliPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[-\s]/g, "");
  return /^(\+972|0)(5[0-9]|7[2-9])\d{7}$/.test(cleaned);
}

/**
 * Normalize an Israeli phone to E.164 (+9725XXXXXXXX).
 * Returns the cleaned input as-is if it doesn't match.
 */
export function normalizeIsraeliPhone(phone) {
  if (!phone) return phone;
  let cleaned = phone.replace(/[-\s]/g, "");
  if (cleaned.startsWith("+972")) return cleaned;
  if (cleaned.startsWith("0")) return "+972" + cleaned.slice(1);
  return cleaned;
}

/**
 * Password strength rules. Each rule is { id, label, check }.
 * Use from a form to render a live checklist: every rule's `check(pw)`
 * returns a boolean that flips as the user types.
 */
export const passwordRules = [
  { id: "len", label: "לפחות 8 תווים", check: (p) => (p || "").length >= 8 },
  { id: "upper", label: "אות גדולה אחת (A-Z)", check: (p) => /[A-Z]/.test(p || "") },
  { id: "digit", label: "ספרה אחת (0-9)", check: (p) => /\d/.test(p || "") },
];

export function passwordValid(password) {
  return passwordRules.every((rule) => rule.check(password));
}

/**
 * Email — basic shape check. Backend re-validates with EmailStr.
 */
export function validateEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
