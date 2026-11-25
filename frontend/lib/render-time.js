// @ts-check
/**
 * Module:   render-time
 * Purpose:  The moment the server rendered this HTML, written into <head> by
 *           the root layout, so a component that shows something by the clock
 *           can hydrate with the server's clock and then move to its own.
 * Touches:  Reads one <meta> in the browser. Nothing else.
 * Does NOT: decide what a date means; `lib/use-israel-today.js` reads it.
 * Related:  app/[locale]/layout.js (writes the tag), lib/israel-date.js.
 * History:  MEH-3861 — /events was rendered on the server on its day and in
 *           the browser on the visitor's. A cached page served after midnight
 *           had a different list in each, and React threw 418 and drew the
 *           page again. The browser cannot know the server's day unless the
 *           HTML carries it.
 */

export const RENDER_TIME_META = "mehamakor-render-time";

/**
 * The server's render time for this document, or null when there is none
 * (no document, no tag, or a value that is not a date).
 *
 * @returns {Date | null}
 */
export function documentRenderTime() {
  if (typeof document === "undefined") return null;
  const value = document.querySelector(`meta[name="${RENDER_TIME_META}"]`)?.getAttribute("content");
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}
