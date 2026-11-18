// @ts-check
import { useEffect } from "react";

/**
 * WCAG 2.1 AA — 2.4.3 Focus Order.
 * Remembers document.activeElement when `open` becomes true and gives focus
 * back to it when the modal closes.
 *
 * MEH-3271: the return rides the effect cleanup, so it also happens when the
 * modal UNMOUNTS while open (a parent that renders it conditionally) — the
 * earlier version only heard `open` going false, and an unmount left focus on
 * <body>. A trigger that has left the page is skipped: focusing a detached
 * node does nothing, silently.
 * @param {boolean} open
 */
export function useFocusReturn(open) {
  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    return () => {
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
  }, [open]);
}
