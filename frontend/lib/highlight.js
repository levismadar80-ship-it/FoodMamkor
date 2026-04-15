/**
 * highlightMatch(text, query)
 *
 * Returns an array of strings + {match: string} objects so consumers
 * can render <mark> wrappers without dangerouslySetInnerHTML.
 *
 * Case-insensitive, matches all occurrences.
 *   highlightMatch("שוק רחובות", "רח")
 *     → ["שוק ", {match: "רח"}, "ובות"]
 *
 * No match or empty query returns [text].
 */
export function highlightMatch(text, query) {
  if (!text) return [];
  if (typeof text !== "string") return [String(text)];
  const q = (query || "").trim();
  if (!q) return [text];

  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();

  const parts = [];
  let cursor = 0;
  let idx = lowerText.indexOf(lowerQ);
  while (idx !== -1) {
    if (idx > cursor) {
      parts.push(text.slice(cursor, idx));
    }
    parts.push({ match: text.slice(idx, idx + q.length) });
    cursor = idx + q.length;
    idx = lowerText.indexOf(lowerQ, cursor);
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts.length ? parts : [text];
}
