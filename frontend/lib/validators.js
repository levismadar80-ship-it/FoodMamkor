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
 * Password policy floor (MEH-306).
 *
 * Single source of truth for the minimum length. Imported by
 * PasswordInput, passwordMessages, and any submit guard so that future
 * bumps stay in lockstep across UI copy + validation.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Password strength rules. MEH-306 (NIST SP 800-63B Rev 4) collapsed
 * the previous 4 composition rules (length / upper / digit / special)
 * into a single length floor. Composition rules are explicitly
 * forbidden by the spec; deny-list + HIBP enforcement runs server-side
 * via /auth/check-password and the register/reset/change handlers.
 *
 * Kept as an array (rather than a single boolean) so PasswordStrength
 * — which renders this as a checklist — keeps a stable shape across
 * the migration. /register/producer (out of scope for the MEH-306
 * sub-B PR) consumes this same array; the wholesale update tightens
 * its frontend floor 8 → 12 chars.
 */
export const passwordRules = [
  {
    id: "len",
    label: `לפחות ${PASSWORD_MIN_LENGTH} תווים`,
    check: (p) => (p || "").length >= PASSWORD_MIN_LENGTH,
  },
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
