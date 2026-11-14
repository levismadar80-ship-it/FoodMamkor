// @ts-check
/**
 * Module:   recipe-scale
 * Purpose:  Scale the amount at the start of a free-text ingredient line when
 *           the reader changes the number of servings (MEH-3121; NYT Cooking /
 *           Allrecipes do the same).
 * Does NOT: understand units or convert them, and does not touch a number
 *           anywhere but the start of the line. A line that does not start
 *           with an amount is returned exactly as written.
 * Related:  lib/recipe-lines.js (the splitter that produces the lines) ·
 *           components/public/RecipeDetail.jsx (the only consumer).
 * History:  MEH-3121 (creation).
 */

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 100;

const GLYPHS = /** @type {Record<string, number>} */ ({
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
});
const GLYPH_CLASS = "[½⅓⅔¼¾⅛]";
const NUM = String.raw`\d+(?:[.,]\d+)?`;
// One amount: «1 1/2», «1/2», «1½», «½», «1.5», «2». Order matters: the
// longest shape first, so «1 1/2» is not read as «1».
const AMOUNT = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+\s?${GLYPH_CLASS}|${GLYPH_CLASS}|${NUM})`;
// An amount, or a range of two («2-3 כפות»). What follows must not make the
// number something other than an amount: «3% שומן», «180° », «2x», «1:1».
const LEADING = new RegExp(String.raw`^(${AMOUNT})(?:(\s?[-–]\s?)(${AMOUNT}))?(?![\d%°:\/.,]|[A-Za-z])`);

// Fractions a cook reads at a glance; anything else is shown as a decimal.
const NICE = /** @type {Array<[number, string]>} */ ([
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
]);
const NICE_TOLERANCE = 0.04;
const WHOLE_FROM = 20; // «333 גרם», not «333.3 גרם»
const TINY = 0.125;

/** @param {string} raw */
function parseAmount(raw) {
  const s = raw.trim();
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : NaN;
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : NaN;
  m = new RegExp(`^(\\d+)?\\s?(${GLYPH_CLASS})$`).exec(s);
  if (m) return Number(m[1] || 0) + GLYPHS[m[2]];
  return Number(s.replace(",", "."));
}

/** @param {number} n */
function trimZeros(n) {
  return String(Number(n.toFixed(2)));
}

/**
 * A scaled amount as a cook would write it: «1½», «¾», «333», «2.4».
 * @param {number} value
 */
export function formatAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= WHOLE_FROM) return String(Math.round(value));
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (rest < NICE_TOLERANCE) return String(whole || trimZeros(value));
  if (1 - rest < NICE_TOLERANCE) return String(whole + 1);
  for (const [frac, glyph] of NICE) {
    if (Math.abs(rest - frac) < NICE_TOLERANCE) return `${whole || ""}${glyph}`;
  }
  return value < TINY ? trimZeros(value) : String(Number(value.toFixed(1)));
}

/**
 * Scale the amount a line starts with. Factor 1, a line with no leading
 * amount, or an amount that cannot be read → the line unchanged.
 * @param {string} line
 * @param {number} factor
 */
export function scaleRecipeLine(line, factor) {
  if (!line || !Number.isFinite(factor) || factor <= 0 || factor === 1) return line;
  const m = LEADING.exec(line);
  if (!m) return line;
  const first = parseAmount(m[1]);
  const second = m[3] ? parseAmount(m[3]) : null;
  if (!(first > 0) || (second !== null && !(second > 0))) return line;
  const a = formatAmount(first * factor);
  const b = second === null ? "" : formatAmount(second * factor);
  if (!a || (second !== null && !b)) return line;
  return `${a}${second === null ? "" : `${m[2]}${b}`}${line.slice(m[0].length)}`;
}

/** @param {unknown} n */
export function clampServings(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MIN_SERVINGS;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, v));
}
