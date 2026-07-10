"use client";

import { useTranslations } from "next-intl";

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
 *   - attribution: optional attribution line (e.g. "— ספיר, מייסדת מהמקור")
 *   - overlayOpacity: 0..1 (default 0.6)
 *   - height: CSS value (default 400px)
 */
export default function ParallaxQuote({
  image,
  quote,
  attribution,
  overlayOpacity = 0.6,
  height = "400px",
}) {
  const t = useTranslations("common.parallax_quote");
  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ height }}
      aria-label={t("aria")}
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
        <div className="text-center max-w-4xl">
          <blockquote
            className="font-headline-display text-headline-display text-white italic leading-tight"
          >
            &ldquo;{quote}&rdquo;
          </blockquote>
          {attribution && (
            <p className="mt-4 text-white/75 font-body-md" style={{ fontSize: "clamp(14px, 1.5vw, 18px)" }}>
              {attribution}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
