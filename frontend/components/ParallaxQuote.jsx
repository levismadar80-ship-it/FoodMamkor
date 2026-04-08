"use client";

/**
 * ParallaxQuote — full-bleed divider section with fixed background image
 * and a centered quote. Used between homepage sections and on /about.
 *
 * Props:
 *   - image: Unsplash URL
 *   - quote: Hebrew string
 *   - overlayOpacity: 0..1 (default 0.6)
 *   - height: CSS value (default 400px)
 */
export default function ParallaxQuote({
  image,
  quote,
  overlayOpacity = 0.6,
  height = "400px",
}) {
  return (
    <section
      className="parallax-bg relative w-full"
      style={{ backgroundImage: `url(${image})`, height }}
      aria-label="ציטוט"
    >
      <div
        className="absolute inset-0 flex items-center justify-center px-6"
        style={{ backgroundColor: `rgba(46, 74, 46, ${overlayOpacity})` }}
      >
        <blockquote
          className="font-headline text-white text-center italic max-w-4xl leading-tight"
          style={{ fontSize: "clamp(24px, 4vw, 48px)" }}
        >
          &ldquo;{quote}&rdquo;
        </blockquote>
      </div>
    </section>
  );
}
