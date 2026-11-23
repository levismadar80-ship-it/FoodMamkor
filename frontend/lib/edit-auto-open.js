// @ts-check
/**
 * Module:   edit-auto-open
 * Purpose:  Which card opens by itself when the owner taps a group tile in the
 *           «עריכה» hub — so she reaches a form in one tap instead of two
 *           (MEH-3762, part 2 of the dashboard simplification, 22/11).
 * Does NOT: decide completion (the page's `cardFilled` does, the same map that
 *           drives the tile's "{done}/{total}"), and does not touch deep links:
 *           a #hash still wins, through the page's hash resolver. Runs on a
 *           TILE TAP only — arriving with ?group= or by Back opens nothing.
 *           Note: the gold next-step dot (page.js `nextStepKey`) is stricter
 *           (products < 3, a default description counts as empty), so on a
 *           profile between the two the dot and the opened card can differ;
 *           the card follows the tile's own count, which the owner sees.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (sole caller);
 *           lib/dashboard-edit-anchors.js (OPEN_KEY_FOR: license/kashrut → trust)
 * History:  MEH-3762 (creation)
 */
import { OPEN_KEY_FOR } from "@/lib/dashboard-edit-anchors";

/**
 * @param {string} _group     the group being entered (?group= value; unused, kept for callers)
 * @param {string[]} members  its counted cards, in tile order
 * @param {Record<string, boolean>} filled  card key → has content
 * @returns {string | null}   the accordion key to open, or null (all closed)
 */
export function autoOpenKeyFor(_group, members, filled) {
  // A group whose members all render as ONE card (trust: license + kashrut)
  // opens it, filled or not.
  const cards = new Set((members || []).map(OPEN_KEY_FOR));
  if (cards.size === 1) return [...cards][0];
  const firstMissing = (members || []).find((key) => !filled[key]);
  return firstMissing ? OPEN_KEY_FOR(firstMissing) : null;
}
