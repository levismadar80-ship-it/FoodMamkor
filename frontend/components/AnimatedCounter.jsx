"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedCounter — counts from 0 up to `target` once the element scrolls
 * into view. Uses IntersectionObserver so the animation fires exactly
 * once, not on every re-render. EaseOut cubic for a snappy finish.
 *
 * Respects prefers-reduced-motion: shows the final number immediately.
 *
 * Props:
 *   - target: final number (required)
 *   - duration: ms to animate (default 1500)
 *   - className: optional passthrough
 */
export default function AnimatedCounter({ target, duration = 1500, className = "" }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ref.current) return;

    // Respect reduced-motion — jump straight to the final number.
    if (typeof window !== "undefined" && window.matchMedia) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        setCount(target);
        started.current = true;
        return;
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
            else setCount(target);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref} className={className}>
      {count}
    </span>
  );
}
