// @ts-check
/**
 * MEH-3169: the design colour tokens as hex strings, for the JS places a
 * Tailwind class cannot reach — canvas drawing, SVG attributes, Leaflet
 * options and divIcon HTML, inline `style`, page metadata.
 *
 * This is the same object the Tailwind colours come from
 * (tailwind.tokens.json, generated from docs/DESIGN.md by
 * `npm run design:export`), so `COLOR.primary` is always exactly the colour of
 * `bg-primary`. Never write a token's hex by hand next to this; read it here.
 */
import tokens from "../tailwind.tokens.json";

export const COLOR = tokens.theme.extend.colors;
