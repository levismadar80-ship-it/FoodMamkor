// @ts-check
/**
 * Module:   edit-auto-open
 * Purpose:  Which card opens by itself when the owner taps a group tile in the
 *           «עריכה» hub — so she reaches a form in one tap instead of two
 *           (MEH-3762, part 2 of the dashboard simplification, 22/11).
 * Does NOT: decide completion (the page's `cardFilled` does, the same map that
 *           drives the tile's "{done}/{total}"), and does not touch deep links:
 *           a #hash still wins, through the page's hash resolver.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (sole caller);
 *           lib/dashboard-edit-anchors.js (OPEN_KEY_FOR: license/kashrut → trust)
 * History:  MEH-3762 (creation)
 */
import { OPEN_KEY_FOR } from "@/lib/dashboard-edit-anchors";

/** Groups that render ONE card: entering them opens it, filled or not. */
const SINGLE_CARD_GROUPS = { trust: "trust" };

/**
 * @param {string} group      the group being entered (?group= value)
 * @param {string[]} members  its counted cards, in tile order
 * @param {Record<string, boolean>} filled  card key → has content
 * @returns {string | null}   the accordion key to open, or null (all closed)
 */
export function autoOpenKeyFor(group, members, filled) {
  if (SINGLE_CARD_GROUPS[group]) return SINGLE_CARD_GROUPS[group];
  const firstMissing = (members || []).find((key) => !filled[key]);
  return firstMissing ? OPEN_KEY_FOR(firstMissing) : null;
}
