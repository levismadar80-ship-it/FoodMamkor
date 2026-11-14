// @ts-check
/**
 * Module:   chip-gate
 * Purpose:  The site rule for any chip row: a chip that would open on an
 *           empty result is not drawn (MEH-3128). Counted rows only — this is
 *           the gate for rows whose page already knows a number per chip.
 * Touches:  nothing — pure function.
 * Does NOT: gate business filters (visibleAxisChips, lib/producer-filters.js,
 *           MEH-2767) or the /events category set (visibleCategoryChips,
 *           lib/event-category-gate.js, MEH-3124). Every chip row in the app
 *           goes through one of the three, or carries a `chip-gate-exempt:`
 *           reason — __tests__/ChipRowGateGuard.test.js enforces that.
 * Related:  app/[locale]/group-buys/GroupBuysClient.jsx (status tabs).
 * History:  MEH-3128 (creation, 14/11/2026 — Sapir: «תקבע מנגנון שיימנע מזה
 *           לקרות»).
 */

/**
 * Drop chips whose count is 0. A chip stays when it is active (the way
 * back), when it is listed in `keep` (e.g. «הכל»), or when its count is not
 * a number (unknown → fail open). `counts === null` = nothing known → all.
 * @template {{ key: string }} C
 * @param {{
 *   chips: C[],
 *   counts: Record<string, number> | null | undefined,
 *   active?: Iterable<string>,
 *   keep?: Iterable<string>,
 * }} args
 * @returns {C[]}
 */
export function dropZeroChips({ chips, counts, active = [], keep = [] }) {
  if (!counts) return chips;
  const stay = new Set([...active, ...keep]);
  return chips.filter((chip) => {
    if (stay.has(chip.key)) return true;
    const n = counts[chip.key];
    return typeof n !== "number" || n > 0;
  });
}
