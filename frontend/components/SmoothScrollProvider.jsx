"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * SmoothScrollProvider (docs/archive/WORLD_CLASS_V2.md #1)
 *
 * Wraps the app with Lenis smooth-scroll. Mounted once in layout.js so
 * every page benefits without each page having to opt in.
 *
 * Respects `prefers-reduced-motion`: if the user has it enabled, we do
 * NOT init Lenis and the browser's native scrolling stays untouched.
 * Accessibility > aesthetics.
 *
 * MEH-1831: skipped on touch pointers too. Lenis's only smoothing input here
 * is `smoothWheel`, which a touch device never produces — so on phones the rAF
 * loop below ran on every frame, for the lifetime of every page, to smooth an
 * event that never arrives. Native momentum scrolling is unaffected either way;
 * the loop was pure main-thread and battery cost for a mobile-first audience.
 */
export default function SmoothScrollProvider({ children }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    let rafId;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return children;
}
