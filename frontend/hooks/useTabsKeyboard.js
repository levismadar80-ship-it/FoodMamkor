/**
 * Module:   useTabsKeyboard
 * Purpose:  The W3C APG Tabs keyboard layer, in one place, for every tablist on
 *           the site. Returns the `onKeyDown` a `role="tablist"` element wears.
 * Does NOT: render anything, own selection state, or decide which tab is
 *           selected. The caller keeps its own state and passes the activator;
 *           this only decides WHICH tab the keystroke means.
 * Related:  frontend/components/Lightbox.jsx:58 (the house RTL arrow mapping
 *           this follows), frontend/app/[locale]/events/EventsClient.jsx,
 *           frontend/app/[locale]/settings/page.jsx (the two consumers).
 * History:  MEH-2199 (chunk 2 shipped it inline in EventsClient; chunk 3 lifted
 *           it here when /settings needed the identical behaviour).
 *
 * WHY THIS IS SHARED RATHER THAN COPIED
 * -------------------------------------
 * The RTL arrow mapping is the part of this most likely to be got wrong, and a
 * wrong mapping is invisible in review — `ArrowLeft` moving the wrong way reads
 * as a plausible line either way. Two copies drift; one copy cannot.
 *
 * ARROW DIRECTION
 * ---------------
 * ArrowLeft = next, ArrowRight = prev. That is the VISUAL mapping for Hebrew
 * reading order and it matches Lightbox.jsx:58, so a keyboard user meets one
 * convention across the site. It is deliberately not the LTR mapping.
 *
 * ACTIVATION IS AUTOMATIC
 * -----------------------
 * Moving focus selects (APG "tabs with automatic activation"). That is the
 * right pattern where the panels are already in the tree and switching is
 * cheap, which holds for both consumers. A tablist whose panel is expensive to
 * build should NOT reuse this without revisiting that choice.
 */
import { useCallback } from "react";

const TAB_ARROW_DELTA = { ArrowLeft: 1, ArrowRight: -1 };

/**
 * @param {(value: string) => void} activate — called with the target tab's
 *   `data-tab-value` once focus has moved to it.
 * @returns {(e: React.KeyboardEvent) => void} handler for the tablist element.
 */
export default function useTabsKeyboard(activate) {
  return useCallback(
    (e) => {
      // The DOM is the single authority for both tab ORDER and wire VALUE: the
      // handler reads the buttons it finds under this tablist and each one's
      // data-tab-value. A parallel array beside the JSX would be a second owner
      // of the same fact, and reordering the buttons would desync it silently
      // (.claude/rules/workflow.md — Smell #1).
      const tabs = Array.from(e.currentTarget.querySelectorAll('[role="tab"]'));
      const from = tabs.indexOf(e.target.closest?.('[role="tab"]'));
      if (from === -1) return;

      let to;
      // Object.hasOwn rather than `key in TAB_ARROW_DELTA`. This is DEFENSIVE,
      // not a fix for a reachable bug, and the distinction was measured rather
      // than assumed: `in` walks the prototype chain, but React's own
      // getEventKey does `normalizeKey[nativeEvent.key] || nativeEvent.key` on
      // the same object shape, so e.key for a name like "constructor" reaches
      // here already coerced to a FUNCTION — and a non-string key misses `in`
      // and `hasOwn` alike. The two forms are indistinguishable today and no
      // test can tell them apart. hasOwn stays because it costs nothing and
      // does not rest on a React internal staying as it is.
      if (Object.hasOwn(TAB_ARROW_DELTA, e.key)) {
        to = (from + TAB_ARROW_DELTA[e.key] + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        to = 0;
      } else if (e.key === "End") {
        to = tabs.length - 1;
      } else {
        // Every other key is left entirely alone — no preventDefault. A handler
        // that swallowed the rest would break type-ahead and browser shortcuts,
        // and would still look correct in a test that only checked the arrows.
        return;
      }

      // A tab with no data-tab-value would activate with `undefined` and select
      // neither panel — leaving the row with zero tab stops, silently. Bail
      // instead; the consumers' tests assert every tab carries one, and THAT is
      // what makes the omission loud.
      const value = tabs[to].dataset.tabValue;
      if (value === undefined) return;
      e.preventDefault();
      tabs[to].focus();
      activate(value);
    },
    [activate],
  );
}
