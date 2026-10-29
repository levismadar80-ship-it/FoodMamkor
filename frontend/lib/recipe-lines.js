/**
 * MEH-2540: one recipe line-splitter for the page and its JSON-LD.
 *
 * Ingredients and instructions are free text, one item per line. Owners often
 * type their own markers («- 6 פרוסות», «1. קולים…»), and the page already
 * draws list-disc / list-decimal — keeping the marker rendered «• – 6 פרוסות»
 * and «1. 1. קולים». A marker counts only when whitespace (or the end of the
 * line) follows it, so «1/2 כוס», «1.5 ליטר» and «-1 מעלות» stay intact.
 */
const LEADING_MARKER = /^(?:[-–—•*·](?:\s+|$)|\d{1,2}[.)](?:\s+|$))/;

export function splitRecipeLines(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((s) => s.trim().replace(LEADING_MARKER, "").trim())
    .filter(Boolean);
}
