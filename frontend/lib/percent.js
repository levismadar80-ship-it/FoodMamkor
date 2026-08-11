/**
 * Module:   percent
 * Purpose:  Clamp a percentage value into the displayable [0, 100] range.
 * Does NOT: format or add a "%" sign — callers own presentation (i18n).
 * History:  MEH-1118 — the dashboard conversion line (whatsapp clicks / profile
 *           views) can exceed 100% because a WhatsApp click from a card/map is
 *           counted without a page view, so the ratio isn't a true subset.
 *           "133.3% מהצופות פנו אלייך" is nonsensical; clamp the displayed value.
 *           MEH-160 — that call site is GONE and this module now has NO
 *           production caller; only its own unit test keeps it alive. Kept
 *           rather than deleted because the deletion is not this ticket's
 *           change (rule 3, one PR = one change), and reported in the PR body
 *           rather than left for someone to discover.
 *
 *           Read the removal as a correction, not a regression of MEH-1118.
 *           The clamp was correct while the denominator was raw page views. It
 *           is now unique daily visitors, and producer_whatsapp_clicks carries
 *           no viewer hash, so a value above 100 is a REAL reading — one
 *           visitor clicking twice. The copy says "per 100 distinct visitors",
 *           which holds at any value. Clamping there turned a wrong contract
 *           into a screen that looked fine, which is the failure the clamp was
 *           mistaken for a fix of.
 *
 *           DO NOT re-apply clampPercent to the conversion line without first
 *           giving the clicks table a viewer hash. Re-adding it restores the
 *           mask, not the invariant.
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
