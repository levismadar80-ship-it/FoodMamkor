/**
 * Pagination helpers (MEH-23). Pure functions — no React, no DOM.
 */

/**
 * Clamp a requested page number into the valid range [1, totalPages].
 * Returns 1 on NaN / zero / negative / non-numeric input so callers
 * don't need to guard every time.
 */
export function clampPage(page, totalPages) {
  const p = Number(page);
  const total = Math.max(1, Number(totalPages) || 1);
  if (!Number.isFinite(p) || p < 1) return 1;
  if (p > total) return total;
  return Math.floor(p);
}

/**
 * Build a numbered-page range with ellipsis markers, e.g.
 *   total=42, current=7, siblings=1  →  [1, '…', 6, 7, 8, '…', 42]
 *
 * Rules:
 *   - Always show first + last.
 *   - Show `siblings` pages on either side of current.
 *   - Insert '…' whenever there's a gap > 1 between adjacent shown pages.
 *   - For small totals (≤ 1 + 2 + 2*siblings + 2) return every page.
 *
 * Output entries are either numbers or the string '…' so consumers can
 * render `typeof entry === 'number' ? <button> : <span>`.
 */
export function buildPageRange(current, total, siblings = 1) {
  const t = Math.max(1, Math.floor(Number(total) || 1));
  const c = clampPage(current, t);

  // Show everything when the compressed list would be as long as the full one.
  const showThreshold = 1 + 2 + siblings * 2 + 2; // first + last + neighbors + 2 ellipses
  if (t <= showThreshold) {
    return Array.from({ length: t }, (_, i) => i + 1);
  }

  const left = Math.max(1, c - siblings);
  const right = Math.min(t, c + siblings);

  const result = [];
  // Left anchor (1) + optional ellipsis
  if (left > 1) result.push(1);
  if (left > 2) result.push("…");

  // Center window
  for (let i = left; i <= right; i++) result.push(i);

  // Right ellipsis + last anchor
  if (right < t - 1) result.push("…");
  if (right < t) result.push(t);

  return result;
}
