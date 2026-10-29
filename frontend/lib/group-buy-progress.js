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
