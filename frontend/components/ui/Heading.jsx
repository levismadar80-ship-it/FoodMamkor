/**
 * Heading — typographic scale primitive (MEH-602).
 *
 * Module:   Heading
 * Purpose:  Render h1-h4 with the project's font tokens so pages stop repeating
 *           inline `font-headline-* text-* font-bold` triplets. Net-new atom.
 * Does NOT: set color beyond the default `text` ink — pass `className` to tint.
 * Related:  ProducerCard.jsx:283 (font-headline-md title), ParallaxQuote.jsx:51
 *           (font-headline-display), tailwind.tokens.json (font families/sizes).
 * History:  MEH-602 (creation).
 *
 * level   : 1 | 2 | 3 | 4  → semantic tag h1…h4 (and default size step)
 * variant : editorial (Frank Ruhl headline) | hero (display headline) | sans
 *           (DM Sans body face)
 *
 * `hero` always uses the display size regardless of level; the semantic tag
 * still follows `level` so document outline stays correct.
 *
 * @example
 * <Heading level={1} variant="hero">מהמקור</Heading>
 * <Heading level={3} variant="editorial">שם העסק</Heading>
 */
const LEVEL_TAG = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" };

const VARIANT_FONT = {
  editorial: "font-headline-md",
  hero: "font-headline-display",
  sans: "font-body-lg",
};

const LEVEL_SIZE = {
  1: "text-headline-lg",
  2: "text-headline-md",
  3: "text-body-lg",
  4: "text-body-md",
};

export default function Heading({
  level = 2,
  variant = "editorial",
  className = "",
  children,
  ...rest
}) {
  const Tag = LEVEL_TAG[level] || "h2";
  const size = variant === "hero" ? "text-headline-display" : LEVEL_SIZE[level] || LEVEL_SIZE[2];

  return (
    <Tag
      className={[
        "text-text font-bold leading-snug",
        VARIANT_FONT[variant] || VARIANT_FONT.editorial,
        size,
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </Tag>
  );
}
