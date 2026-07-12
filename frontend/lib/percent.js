/**
 * Module:   percent
 * Purpose:  Clamp a percentage value into the displayable [0, 100] range.
 * Does NOT: format or add a "%" sign — callers own presentation (i18n).
 * History:  MEH-1118 — the dashboard conversion line (whatsapp clicks / profile
 *           views) can exceed 100% because a WhatsApp click from a card/map is
 *           counted without a page view, so the ratio isn't a true subset.
 *           "133.3% מהצופות פנו אלייך" is nonsensical; clamp the displayed value.
 */

/**
 * Clamp a numeric percentage to [0, 100]. Non-finite input (null/undefined/NaN)
 * collapses to 0. Fractional values are preserved (e.g. 45.5 → 45.5).
 * @param {number|string|null|undefined} value
 * @returns {number} a number in [0, 100]
 */
export function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
