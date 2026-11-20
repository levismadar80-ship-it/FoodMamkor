// @ts-check
"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Module:   use-visual-viewport-box
 * Purpose:  The box a `position: fixed` overlay needs to cover exactly what is
 *           on screen — the VISUAL viewport — while `active` is true.
 * Does NOT: decide anything about layout; the caller applies the box as an
 *           inline style. Not a fix for the iOS 26 fixed-bottom drift on the
 *           rest of the site (that is components/IosViewportPin.jsx).
 * Related:  components/MiniMap.jsx (fullscreen overlay).
 * History:  MEH-3509 — the MiniMap overlay was `fixed inset-0`, sized to the
 *           LAYOUT viewport. On an iPhone with the page pinch-zoomed (a pinch on
 *           the gesture-less inline map zooms the page) or with iOS 26 drift,
 *           the visible window is smaller than that, so the overlay's X sat
 *           off-screen and every touch inside went to Leaflet: no way out.
 *
 * `offsetTop` / `offsetLeft` are the visible window's offset inside the layout
 * viewport, which is exactly what `top` / `left` of a fixed element measure
 * from. Physical left here is viewport geometry, not text direction.
 *
 * Returns null when inactive, when the browser has no `visualViewport`, or when
 * the visible window IS the layout viewport (no zoom, no offset, full height):
 * the caller then keeps its `inset-0`, so desktop and a healthy phone render
 * exactly as before. Width is not compared on purpose: a desktop scrollbar
 * makes `vv.width` narrower than `innerWidth` with nothing wrong.
 *
 * A layout effect, so the box lands before paint and the overlay never shows a
 * frame with its X off-screen.
 *
 * @param {boolean} active
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
export function useVisualViewportBox(active) {
  const [box, setBox] = useState(
    /** @type {{ top: number, left: number, width: number, height: number } | null} */ (null),
  );

  useLayoutEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !vv) {
      setBox(null);
      return undefined;
    }
    const read = () => {
      const shifted =
        vv.scale > 1.01 || vv.offsetTop > 1 || vv.offsetLeft > 1 || vv.height < window.innerHeight - 1;
      const next = shifted
        ? { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height }
        : null;
      // Same box → same object, so a scroll event that moves nothing does not
      // re-render the map.
      setBox((prev) => (sameBox(prev, next) ? prev : next));
    };
    read();
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, [active]);

  return box;
}

/**
 * @param {{ top: number, left: number, width: number, height: number } | null} a
 * @param {{ top: number, left: number, width: number, height: number } | null} b
 */
function sameBox(a, b) {
  if (a === null || b === null) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}
