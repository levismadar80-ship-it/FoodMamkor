/**
 * highlightMatch(text, query) — MEH-99 Enhancement 3.
 *
 * Returns an array of strings and <mark> elements so consumers can
 * drop the result directly into JSX. Case-insensitive, all occurrences.
 *
 * Brand styling: bg-transparent font-bold text-primary (not yellow).
 *
 * highlightMatch("גבינות הר הגולן", "גבינ")
 *   → [<mark>גבינ</mark>, "ות הר הגולן"]
 */
export function highlightMatch(text, query) {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("(" + escaped + ")", "gi");
  return text.split(regex).map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-transparent font-bold text-primary">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
