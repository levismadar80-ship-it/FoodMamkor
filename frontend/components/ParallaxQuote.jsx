"use client";

/**
 * ParallaxQuote — full-bleed divider section with a slow Ken Burns
 * background pan/zoom and a centered quote. Used between homepage
 * sections and on /about.
 *
 * PREMIUM_DESIGN: previously this used `background-attachment: fixed`
 * parallax. That works but feels dated. The background now lives on an
 * inner layer with the `kenburns-left` animation, giving a subtle
 * cinematic drift. Honors prefers-reduced-motion via the global CSS.
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
      className="relative w-full overflow-hidden"
      style={{ height }}
      aria-label="ציטוט"
    >
      <div
        className="kenburns-left absolute"
        style={{
          inset: "-5%",
          backgroundImage: `url(${image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
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
