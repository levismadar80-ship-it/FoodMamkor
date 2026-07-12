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

/**
 * MEH-1140: single canonical shekel price format for every display surface.
 *
 * Canon (DECIDED in the ticket — do not re-litigate per surface):
 *   formatPrice(35)                       → "35₪"        (amount then shekel, no space)
 *   formatPrice(35, { from: true })       → "מ-35₪"
 *   formatPrice(35, { unit: "יחידה" })    → "35₪ / יחידה"
 *   formatPrice(0)                        → "0₪"          (gift/free semantics stay at
 *                                                          the call site — e.g. events
 *                                                          gate price===0 → "free" label
 *                                                          BEFORE calling this)
 *   formatPrice(null | undefined | "")    → null           (caller renders nothing)
 *   formatPrice(1234.5)                   → "1,234.5₪"     (he-IL grouping, ≤2 decimals)
 *
 * dir="ltr" wrapping stays at the call site where the surface already does it
 * (the ₪ is a bidi European Terminator, so "35₪" holds together either way).
 * Free-text DB labels (starting_price_label / price_range) are DATA, not
 * formatting — never routed through here.
 *
 * @param {number|string|null|undefined} amount
 * @param {{ from?: boolean, unit?: string|null }} [opts]
 * @returns {string|null}
 */
export function formatPrice(amount, { from = false, unit = null } = {}) {
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return null;
  const digits = n.toLocaleString("he-IL", { maximumFractionDigits: 2 });
  const base = `${from ? "מ-" : ""}${digits}₪`;
  return unit ? `${base} / ${unit}` : base;
}

/**
 * MEH-1140: min–max range in the same canon: "35₪–60₪".
 * min only → "35₪" · both equal → "35₪" · neither → null.
 */
export function formatPriceRange(min, max) {
  const lo = formatPrice(min);
  const hi = formatPrice(max);
  if (lo && hi && lo !== hi) return `${lo}–${hi}`;
  return lo || hi;
}
