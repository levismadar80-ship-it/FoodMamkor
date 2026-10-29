/**
 * MEH-2540: progress toward the group price, for the list card and the page.
 *
 * Measured against `min_participants` — the number both labels show
 * («{commits} מתוך {min} משתתפות»). It was `max || min`, which drew a 10% bar
 * beside «2 מתוך 2» whenever a business set a maximum.
 */
export function groupBuyProgressPct(commits, min) {
  if (!min || min <= 0) return 0;
  return Math.min(100, Math.round(((commits || 0) / min) * 100));
}

/**
 * MEH-2544: the saving as a whole percent, for the card badge and the page's
 * «חיסכון של N%». Prices arrive as Decimal strings («18.00»). A missing or
 * non-positive regular price, or a group price that is not lower, is 0 — the
 * badge then hides.
 */
export function groupBuyDiscountPct(regular, group) {
  // Number(null) and Number("") are 0 — a missing group price would read as 100% off.
  if (group == null || group === "") return 0;
  const r = Number(regular);
  const g = Number(group);
  if (!(r > 0) || !Number.isFinite(g) || g >= r) return 0;
  return Math.round(((r - g) / r) * 100);
}
