/**
 * Module:   panel-position
 * Purpose:  Viewport-fit geometry shared by every portaled, `position: fixed`
 *           panel — the one owner of "does this panel fit below its trigger,
 *           and where does it go when it doesn't".
 * Does NOT: measure anything itself. Callers pass rects they measured; these
 *           are pure functions so they can be unit-tested without a layout
 *           engine (jsdom reports every rect as 0, so a component test cannot
 *           cover this at all — see __tests__/AdminRowMenuViewportFit.test.js).
 * Related:  components/ui/Popover.jsx (overlay placement — owns `clamp`'s
 *           original definition, moved here) ·
 *           components/admin/AdminRowMenu.jsx (row kebab)
 * History:  MEH-2230 — AdminRowMenu pinned `top` to `triggerRect.bottom + gap`
 *           with no viewport reference at all (`window.innerHeight` appeared
 *           zero times in the file), while clamping the INLINE axis via
 *           `window.innerWidth`. Measured at 375x812 on /admin/producers: the
 *           panel opened 77px below the fold for the FIRST row and 1457px
 *           below it for the last, and scrolling to reach it fired the
 *           capture-phase close handler — so there was no way to reach it.
 *           Popover already solved the same problem correctly; extracting
 *           rather than re-implementing keeps one owner (Smell #1).
 */

// `max` is floored at `min` so a panel larger than the viewport degrades to
// "pinned at the near edge" instead of inverting the clamp.
export const clamp = (min, value, max) =>
  Math.min(Math.max(value, min), Math.max(min, max));

// Distance between the trigger edge and the panel (mirrors the pre-portal
// `mt-1` = 0.25rem), and the minimum distance from any viewport edge.
export const MENU_GAP_PX = 4;
export const MENU_PAD_PX = 8;

/**
 * Where the top edge of a fixed panel goes, given its trigger and its own
 * measured height. Prefers below the trigger, flips above when there is no
 * room, and clamps into the viewport when neither side fits.
 *
 * @param {{top: number, bottom: number}} triggerRect — viewport coords.
 * @param {number} panelHeight — the panel's measured height, in px.
 * @param {number} viewportHeight — `window.innerHeight`.
 * @returns {number} the `top` value, in px.
 */
export function computeMenuTop(
  triggerRect,
  panelHeight,
  viewportHeight,
  gap = MENU_GAP_PX,
  pad = MENU_PAD_PX,
) {
  const below = triggerRect.bottom + gap;
  if (below + panelHeight <= viewportHeight - pad) return below;

  // No room below — flip above the trigger, but only if the panel fully fits
  // there. A partial flip would trade one off-screen edge for the other.
  const above = triggerRect.top - gap - panelHeight;
  if (above >= pad) return above;

  // Fits neither side (a panel taller than the space around the trigger):
  // pin it inside the viewport rather than letting it run off the bottom.
  return clamp(pad, below, viewportHeight - panelHeight - pad);
}
