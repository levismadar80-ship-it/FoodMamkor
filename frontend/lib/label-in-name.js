/**
 * WCAG 2.5.3 Label in Name (axe `label-content-name-mismatch`).
 *
 * A control that shows text AND carries an aria-label must have an accessible
 * name that contains — best practice: starts with — the text a sighted
 * speech-input user reads off it ("click שמירה"). Composes only strings the
 * caller already has: when the descriptive label already starts with the
 * visible text it is used as-is, otherwise the visible text is put first.
 *
 *   labelInName("שמירה", "הוסיפו למועדפים") → "שמירה, הוסיפו למועדפים"
 *   labelInName("שיתוף", "שיתוף החוויה")   → "שיתוף החוויה"
 */
export function labelInName(visible, label) {
  const v = (visible ?? "").trim();
  const l = (label ?? "").trim();
  if (!v) return l;
  if (!l || l.startsWith(v)) return l || v;
  return `${v}, ${l}`;
}
