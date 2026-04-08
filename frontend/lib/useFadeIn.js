"use client";

import { useEffect, useRef } from "react";

/**
 * Fade-in on scroll using IntersectionObserver.
 * Apply the ref to a section; the section starts hidden (opacity: 0,
 * translateY 30px) and animates into view when it crosses the threshold.
 *
 * Usage:
 *   const ref = useFadeIn();
 *   return <section ref={ref} className="fade-in-init">...</section>;
 *
 * .fade-in-init is declared in globals.css to avoid FOUC.
 */
export default function useFadeIn({ threshold = 0.15, once = true } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    // Respect reduced motion — just reveal immediately.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
            if (once) observer.unobserve(entry.target);
          }
        });
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  return ref;
}
