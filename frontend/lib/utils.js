/**
 * Frontend utility helpers — keep small, pure, and side-effect-free.
 * More specialized utilities live in their own files (see `validators.js`
 * for form validators, `cloudinary.js` for image URL builders, etc).
 */

/**
 * Build a WhatsApp direct-message URL for a normalised phone number.
 * On desktop (mouse + fine pointer) → web.whatsapp.com/send to avoid the
 * wa.me redirect loop that dead-ends on desktop browsers without the app.
 * On mobile → wa.me to open the native app directly.
 * SSR (window undefined) → falls back to wa.me.
 *
 * @param {string} phone — normalised digits (output of normalizePhone)
 * @param {string} [text] — pre-filled message text (plain, not encoded)
 */
export function getWhatsAppHref(phone, text = "") {
  const encoded = encodeURIComponent(text);
  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  return isDesktop
    ? `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`
    : `https://wa.me/${phone}?text=${encoded}`;
}

/**
 * Normalize an Israeli phone number into the exact format that WhatsApp's
 * `wa.me` deep-link expects: a contiguous digit string with NO `+`, NO
 * spaces, NO dashes, NO parentheses, NO dots, NO other punctuation.
 *
 * Before this helper existed, at least 4 call sites (`ProducerCard.jsx`,
 * `MapComponent.jsx`, `ProducerDetail.jsx`, `WhatsAppButton.jsx`) each
 * rolled their own version of this logic with subtly-different bugs —
 * most famously an order-of-operations bug where
 *   `phone.replace(/^0/, "972").replace(/[-\s]/g, "")`
 * fails on inputs with a leading space (` 0501234567`) because the `^0`
 * regex doesn't match when position 0 is a space. Extracting and
 * hardening the logic eliminates that whole class of bug.
 *
 * Rules:
 *   1. Strip every non-digit character. Spaces, dashes, parens, dots,
 *      letters, stray `+` signs — all gone. This is deliberately more
 *      aggressive than the task file's "spaces, dashes, parentheses"
 *      wording, because real user input includes all of those.
 *   2. If the resulting digits start with `0` (Israeli local format),
 *      replace that leading `0` with `972` (Israel's country code).
 *   3. Otherwise return the digits as-is. This handles input that
 *      already started with `+972...` (where step 1 dropped the `+`
 *      and left `972...`) and the already-normalized case.
 *
 * Output examples:
 *   normalizePhone("052-123-4567")     → "972521234567"
 *   normalizePhone("+972501234567")    → "972501234567"
 *   normalizePhone("(050) 123-4567")   → "972501234567"
 *   normalizePhone("0501234567")       → "972501234567"
 *   normalizePhone("972501234567")     → "972501234567"
 *   normalizePhone(" 0501234567 ")     → "972501234567"   (no order bug)
 *   normalizePhone("050.123.4567")     → "972501234567"
 *   normalizePhone("")                 → ""
 *   normalizePhone(null)               → ""
 *
 * Usage:
 *   const url = `https://wa.me/${normalizePhone(producer.phone)}?text=${encoded}`;
 *
 * Guard empty-input with:
 *   const num = normalizePhone(producer.phone);
 *   if (!num) return null;
 *
 * @param {string | null | undefined} phone — raw phone in any reasonable format
 * @returns {string} digits-only string ready for `wa.me`, or "" if input was empty
 */
export function normalizePhone(phone) {
  if (!phone) return "";
  // Step 1: strip all non-digit characters in one pass.
  const digits = String(phone).replace(/\D/g, "");
  // Step 2: Israeli local format (leading 0) → international.
  const normalized = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  // Step 3: validate Israeli mobile — must be 972 + prefix [5-9] + 8 digits.
  // Rejects truncated/extra digits (e.g. "9725012345678" has 13 digits → invalid).
  if (!/^972[5-9]\d{8}$/.test(normalized)) return "";
  return normalized;
}
