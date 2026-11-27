// @ts-check
/**
 * Module:   optional-chunk
 * Purpose:  A lazily loaded add-on (the chat widget, a mini map) whose code
 *           fails to download renders nothing instead of taking the page down.
 *           Without this, next/dynamic rethrows the ChunkLoadError during
 *           render and the nearest error boundary replaces the WHOLE page with
 *           «משהו השתבש» — for a widget the visitor did not even open.
 * Does NOT: retry: React.lazy keeps the first result, so a failed add-on stays
 *           empty until the next full page load (before, the rejection was
 *           kept the same way). Does not hide a module that loaded and then
 *           threw (a real bug): only a failed DOWNLOAD is caught, anything
 *           else is rethrown to the error boundary and Sentry. Does not cover
 *           a chunk the page itself needs (the /map map, the order sheet):
 *           those stay on plain dynamic(), held by
 *           scripts/checks/optional-chunk-guard.sh.
 * Related:  components/ChatWidgetLazy.jsx (in the root layout, so on every
 *           page); e2e/flows/_load-guard.ts (MEH-3879 excuses a cancelled
 *           chunk only when its failed request was seen).
 * History:  MEH-3946 (creation: a chat chunk cancelled by a navigation in
 *           WebKit, or lost on a flaky phone network, showed the error page).
 */

/** What renders in place of an add-on whose chunk did not load. */
function Nothing() {
  return null;
}

/** Turbopack: name ChunkLoadError, "Failed to load chunk …"; webpack: "Loading chunk … failed". */
const CHUNK_LOAD_MESSAGE = /Failed to load chunk|Loading (?:CSS )?chunk .* failed/;

/** @param {unknown} err */
function isChunkLoadError(err) {
  if (!err || typeof err !== "object") return false;
  const { name, message } = /** @type {{ name?: unknown, message?: unknown }} */ (err);
  return name === "ChunkLoadError" || (typeof message === "string" && CHUNK_LOAD_MESSAGE.test(message));
}

/**
 * Wraps a dynamic() loader: on a failed download (and only then), warns once (not an error —
 * the page is fine) and resolves to a component that renders nothing.
 *
 * @template T
 * @param {() => Promise<T>} load  the `() => import("…")` given to dynamic()
 * @param {string} name            for the warning only
 * @returns {() => Promise<T | { default: () => null }>}
 */
export function optionalChunk(load, name) {
  return () =>
    load().catch((err) => {
      if (!isChunkLoadError(err)) throw err;
      console.warn(`[optional-chunk] ${name} did not load; the page goes on without it.`, err);
      return { default: Nothing };
    });
}
