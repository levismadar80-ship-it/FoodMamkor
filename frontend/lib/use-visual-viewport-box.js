// @ts-check
"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

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
 * Read through useSyncExternalStore: the box is right on the first render of
 * the overlay (no frame with the X off-screen) and no state is set in an effect.
 * The snapshot is a string, so a scroll event that moves nothing compares equal
 * and does not re-render the map.
 *
 * @param {boolean} active
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
export function useVisualViewportBox(active) {
  const subscribe = useCallback(
    /** @param {() => void} onChange */
    (onChange) => {
      const vv = active && typeof window !== "undefined" ? window.visualViewport : null;
      if (!vv) return () => {};
      vv.addEventListener("resize", onChange);
      vv.addEventListener("scroll", onChange);
      return () => {
        vv.removeEventListener("resize", onChange);
        vv.removeEventListener("scroll", onChange);
      };
    },
    [active],
  );
  const getSnapshot = useCallback(() => (active ? snapshotKey() : ""), [active]);
  const key = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return useMemo(() => {
    if (!key) return null;
    const [top, left, width, height] = key.split(",").map(Number);
    return { top, left, width, height };
  }, [key]);
}

/** "" when there is nothing to correct, else "top,left,width,height". */
function snapshotKey() {
  const vv = typeof window === "undefined" ? null : window.visualViewport;
  if (!vv) return "";
  const shifted =
    vv.scale > 1.01 || vv.offsetTop > 1 || vv.offsetLeft > 1 || vv.height < window.innerHeight - 1;
  return shifted ? `${vv.offsetTop},${vv.offsetLeft},${vv.width},${vv.height}` : "";
}
