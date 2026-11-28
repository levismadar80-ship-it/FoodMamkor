// @ts-check
"use client";

/**
 * Module:   hooks/useNearViewport
 * Purpose:  True once an element comes within `margin` of the viewport, and
 *           true from then on — so a below-the-fold section sends its request
 *           only when the reader is getting close to it.
 * Does NOT: fetch or render anything; the caller puts the ref on a sentinel
 *           and starts its own request once this turns true.
 * Related:  components/HomeWhatsOn.jsx (the «מה קורה» rows) and
 *           app/[locale]/home/HomeHolidayShelf.jsx — the two callers;
 *           components/HomepageMiniMapLazy.jsx:40-42 (why the decision is an
 *           effect, not the first render).
 * History:  MEH-3993 (moved out of HomeWhatsOn.jsx when the holiday shelf
 *           became the second caller).
 */

import { useEffect, useRef, useState } from "react";

/**
 * @param {string} margin  IntersectionObserver rootMargin, e.g. "600px 0px"
 * @param {boolean} [enabled]  false = do not observe yet (nothing to load)
 * @returns {[import("react").MutableRefObject<any>, boolean]}
 */
export default function useNearViewport(margin, enabled = true) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near || !enabled) return undefined;
    // Deliberately a setState in the effect, not a lazy useState initialiser:
    // the server renders the sentinel, so deciding on the first render would
    // be a hydration mismatch (HomepageMiniMapLazy.jsx:40-42).
    if (typeof window.IntersectionObserver !== "function") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setNear(true);
      return undefined;
    }
    const el = ref.current;
    if (!el) return undefined;
    const observer = new window.IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, enabled, margin]);

  return [ref, near];
}
