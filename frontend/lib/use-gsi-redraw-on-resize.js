// @ts-check
"use client";

import { useEffect, useRef } from "react";

/**
 * Module:   use-gsi-redraw-on-resize
 * Purpose:  Redraw Google's sign-in button at the new width when the screen
 *           width changes, so it never sticks out of a narrower screen.
 * Does NOT: load GSI or draw the button the first time (that is
 *           useGoogleSignIn's onReady in lib/use-google-sign-in.js).
 * Related:  components/GoogleAuthButton.jsx, components/ProducerOAuthButtons.jsx
 * History:  MEH-3687 (staging red: 43-site-sanity.spec.ts /register/producer
 *           at 320 — the button stayed 361px wide in a 320px viewport).
 *
 * WHY. renderButton() takes a fixed pixel `width`, read from the slot once,
 * when GSI loads. A phone that rotates, or the sanity spec going 390 → 320,
 * leaves the button at the old width.
 *
 * WHY THE SLOT IS EMPTIED BEFORE IT IS MEASURED. The old, wider button is
 * inside the slot. Under a flex ancestor whose min-width is its min-content,
 * that child holds the slot open, so reading offsetWidth with the child still
 * there returns the old width and the redraw would change nothing. Emptying it
 * first measures the width the layout actually gives the slot.
 *
 * Only a change of window.innerWidth counts: a height-only resize (the phone's
 * address bar sliding away while scrolling) must not make the button flicker.
 *
 * @param {{ current: HTMLElement | null }} ref  the slot passed to renderButton
 * @param {() => void} draw  calls renderButton on ref.current
 */
export function useGsiRedrawOnResize(ref, draw) {
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let lastWidth = window.innerWidth;

    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      const el = ref.current;
      // Not drawn yet (GSI still loading): the first draw reads the width then.
      if (!el || el.childElementCount === 0 || !window.google?.accounts?.id) return;
      el.replaceChildren();
      drawRef.current();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ref]);
}
