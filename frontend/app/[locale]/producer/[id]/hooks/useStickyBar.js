import { useEffect, useRef, useState } from "react";

/**
 * IntersectionObserver-driven mobile sticky bar visibility.
 *
 * Verbatim extraction from ProducerDetail.jsx:56 (inlineCTARef),
 * :58 (isBarVisible state), and :101-110 (the IO effect). The bar
 * shows when the inline CTA exits the viewport and hides when the
 * inline CTA re-enters — the IO uses threshold: 0 so the toggle
 * fires at the exact viewport boundary.
 *
 * Render-order invariant: the consumer must attach `inlineCTARef`
 * to the DOM node that mounts in the SAME position as the
 * pre-refactor `<div ref={inlineCTARef} className="md:hidden mt-4">`
 * at ProducerDetail.jsx:428. Otherwise the IO observes a different
 * element and the bar fires at the wrong scroll position.
 */
export function useStickyBar({ producerId }) {
  const inlineCTARef = useRef(null);
  const [isBarVisible, setIsBarVisible] = useState(false);

  useEffect(() => {
    const el = inlineCTARef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setIsBarVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [producerId]);

  return { inlineCTARef, isBarVisible };
}
