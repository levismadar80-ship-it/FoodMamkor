// @ts-check
/**
 * Module:   admin/copy/copy-filter
 * Purpose:  MEH-3672. The pure half of /admin/copy: flatten he.json into
 *           rows, and pick the groups and rows that match a search and a
 *           screen. No React, so the test calls it directly.
 * Does NOT: decide where a group renders — that is the generated index,
 *           lib/copy-screens.json (scripts/build-copy-screens.mjs).
 * History:  MEH-3672 (creation).
 */

/** At most this many rows are drawn at once; the rest are counted. */
const MAX_ROWS = 300;

/**
 * @param {unknown} node
 * @param {string} prefix
 * @returns {{ key: string, value: string }[]}
 */
function flattenMessages(node, prefix = "") {
  if (typeof node === "string") return [{ key: prefix, value: node }];
  if (Array.isArray(node))
    return node.flatMap((v, i) => flattenMessages(v, `${prefix}[${i}]`));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) =>
      flattenMessages(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

/**
 * @param {Record<string, unknown>} messages he.json
 * @param {{ groups: Record<string, string[]> }} index copy-screens.json
 * @param {{ query?: string, screen?: string, cap?: boolean }} filter  cap: stop
 *        drawing rows after MAX_ROWS (a search opens every matching group).
 */
export function filterCopy(
  messages,
  index,
  { query = "", screen = "", cap = false },
) {
  const q = query.trim().toLowerCase();
  const groups = [];
  let total = 0;
  let drawn = 0;
  for (const name of Object.keys(messages).sort()) {
    const screens = index.groups[name] || [];
    if (screen && !screens.includes(screen)) continue;
    const rows = flattenMessages(messages[name], name).filter(
      (r) =>
        !q ||
        r.value.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q),
    );
    if (rows.length === 0) continue;
    total += rows.length;
    const room = cap ? Math.max(0, MAX_ROWS - drawn) : rows.length;
    drawn += Math.min(room, rows.length);
    groups.push({
      name,
      screens,
      count: rows.length,
      rows: rows.slice(0, room),
    });
  }
  return { groups, total, drawn };
}
