// @ts-check
/**
 * Module:   route-entry-files
 * Purpose:  MEH-3463 — find the files that render a route under app/[locale]:
 *           its page file and every layout between [locale] and the page,
 *           through route groups ("(whats-on)/events/page.js" is /events).
 * Does NOT: follow imports — each guard decides how deep it reads.
 * Related:  __tests__/HubShellGuard.test.js, __tests__/HubRoutesStaticGuard.test.js.
 */
import fs from "node:fs";
import path from "node:path";

export const LOCALE_APP = path.resolve(__dirname, "..", "..", "app", "[locale]");

const firstFile = (dir, base) =>
  ["js", "jsx"].map((e) => path.join(dir, `${base}.${e}`)).find((f) => fs.existsSync(f)) || null;

/** Directory chains under `dir` that match `segments`, skipping "(group)" folders. */
function matchDirs(dir, segments) {
  if (segments.length === 0) return [[dir]];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (/^\(.+\)$/.test(entry.name)) {
      for (const chain of matchDirs(full, segments)) out.push([dir, ...chain]);
    } else if (entry.name === segments[0]) {
      for (const chain of matchDirs(full, segments.slice(1))) out.push([dir, ...chain]);
    }
  }
  return out;
}

/**
 * @param {string} href e.g. "/events"
 * @returns {{ page: string | null, layouts: string[] }} layouts below [locale], outermost first
 */
export function routeEntryFiles(href) {
  const segments = href.split("/").filter(Boolean);
  for (const chain of matchDirs(LOCALE_APP, segments)) {
    const page = firstFile(chain[chain.length - 1], "page");
    if (!page) continue;
    const layouts = chain.slice(1).map((d) => firstFile(d, "layout")).filter((f) => f !== null);
    return { page, layouts: /** @type {string[]} */ (layouts) };
  }
  return { page: null, layouts: [] };
}
