import { useEffect, useRef } from "react";

/**
 * WCAG 2.1 AA — 2.4.3 Focus Order.
 * Captures document.activeElement when `open` becomes true,
 * and restores focus to it when `open` becomes false (modal close).
 */
export function useFocusReturn(open) {
  const returnRef = useRef(null);
  useEffect(() => {
    if (open) {
      returnRef.current = document.activeElement;
    } else if (returnRef.current) {
      returnRef.current.focus();
      returnRef.current = null;
    }
  }, [open]);
}
