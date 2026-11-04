// The host writes «מה להביא» as free text. One item per line; a single line is
// split on commas («סינר, נעליים סגורות») — but not on a comma inside
// parentheses («גרביים (לבנות, לא צבעוניות)» stays one item). Empty pieces
// are dropped.
function splitTopLevelCommas(line) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of line) {
    if (ch === "(" || ch === "[") depth += 1;
    else if ((ch === ")" || ch === "]") && depth > 0) depth -= 1;
    if ((ch === "," || ch === "،") && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

export function splitBringList(text) {
  const raw = (text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const parts = lines.length > 1 ? lines : splitTopLevelCommas(raw);
  return parts.map((x) => x.trim().replace(/^[-•*·]\s*/, "")).filter(Boolean);
}
