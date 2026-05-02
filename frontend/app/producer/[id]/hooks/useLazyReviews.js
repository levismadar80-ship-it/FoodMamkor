import { useEffect, useRef, useState } from "react";

/**
 * Lazy-mount gate for the reviews section. Verbatim extraction from
 * ProducerDetail.jsx:55 (reviewsContainerRef), :57 (reviewsVisible
 * state), and :114-128 (the IO effect with rootMargin: "300px").
 *
 * The 300px rootMargin pre-loads reviews just before the user scrolls
 * to the section, hiding the network/render cost of ReviewsSection
 * (which itself fetches /reviews). Once mounted, the IO disconnects
 * to avoid re-firing.
 *
 * Consumer must attach `reviewsContainerRef` to the wrapper div that
 * conditionally renders ReviewsSection when `reviewsVisible` is true.
 */
export function useLazyReviews({ producerId }) {
  const reviewsContainerRef = useRef(null);
  const [reviewsVisible, setReviewsVisible] = useState(false);

  // Lazy-mount reviews: only fetch when the section scrolls into view.
  // rootMargin 300px pre-loads just before the user reaches the fold.
  useEffect(() => {
    const el = reviewsContainerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReviewsVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [producerId]);

  return { reviewsContainerRef, reviewsVisible };
}
