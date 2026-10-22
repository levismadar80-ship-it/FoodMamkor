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
 *
 * MEH-1685 — `{ inverted: true }` flips the emphasis for autocomplete rows
 * (Baymard/Algolia "inverted highlighting"): the part she already typed is
 * regular weight, the continuation she has not read yet is bold. Opt-in, so
 * ProducerCard's search-result highlighting keeps the default above. No
 * match at all → the text is returned untouched (nothing to invert against).
 */
export function highlightMatch(text, query, { inverted = false } = {}) {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("(" + escaped + ")", "gi");
  if (inverted) return invertedParts(text, regex);
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

// MEH-1685: split() with one capture group alternates [before, match,
// between, match, …], so odd indices are exactly the typed matches — no
// re-test against the shared /g regex (its lastIndex carries between calls).
function invertedParts(text, regex) {
  const pieces = text.split(regex);
  if (pieces.length === 1) return text;
  return pieces
    .map((part, i) => ({ part, typed: i % 2 === 1, key: i }))
    .filter(({ part }) => part !== "")
    .map(({ part, typed, key }) => (
      <span key={key} className={typed ? "font-normal" : "font-bold"}>
        {part}
      </span>
    ));
}
