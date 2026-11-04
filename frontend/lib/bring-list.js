// The host writes «מה להביא» as free text. One item per line; a single line is
// split on commas («סינר, נעליים סגורות»). Empty pieces are dropped.
export function splitBringList(text) {
  const raw = (text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const parts = lines.length > 1 ? lines : raw.split(/[,،]/);
  return parts.map((x) => x.trim().replace(/^[-•*·]\s*/, "")).filter(Boolean);
}
