// @ts-check

/**
 * Module:   stream-settled
 * Purpose:  Run a mount-time state update only once no streamed part of the
 *           page is still waiting to be revealed, so the update cannot make
 *           React throw the server HTML away and render the page again.
 * Does NOT: decide what to update (lib/auth-context.js does), or wait for
 *           hydration itself: a revealed, not-yet-hydrated boundary is handled
 *           by React (a transition update waits for it, react.dev/errors/421).
 * Related:  lib/auth-context.js (loadSession) · app/[locale]/loading.js (the
 *           route boundary whose content arrives outlined)
 * History:  MEH-3718 (creation)
 *
 * Why: every page under app/[locale] streams inside the loading.js boundary.
 * A page bigger than React's progressive chunk (12,800 bytes) arrives as a
 * hidden segment, and React 19 reveals it no sooner than 300 ms after the
 * first paint, marking the boundary `$~` (queued) until then. A context update
 * that reaches a boundary in that state (`$?` or `$~`) is not deferred, not
 * even in a transition: React renders the boundary from scratch in the
 * browser (react-dom updateDehydratedSuspenseComponent, the
 * `isSuspenseInstancePending` branch). Until the reveal removes it, the hidden
 * server copy sits beside the new one: two `login-register-link`s, two
 * `hero-search` boxes (MEH-3718 · MEH-3834 · MEH-2323), and the page is
 * client-rendered after all. Measured 26/11 on a local production build: the
 * AuthProvider's guest `loading: false` was the update, and the second copy
 * appeared in the same commit.
 */

/** Queued for a throttled reveal: the content is in the document, hidden. */
const QUEUED = "$~";
/** Still streaming: React treats it as a client-render fallback once the
 *  document has finished loading, so it only counts while it is loading. */
const STREAMING = "$?";
/** Poll by timer, not requestAnimationFrame, which never fires in a hidden tab. */
const POLL_MS = 16;
/** A safety net, not a timing: React reveals within ~300 ms of the first paint. */
const MAX_WAIT_MS = 5000;

/**
 * @param {Document} [doc]
 * @returns {boolean} true while a streamed boundary is queued for its reveal,
 *          or still streaming while the document is loading
 */
export function hasPendingBoundary(doc = document) {
  const loading = doc.readyState === "loading";
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_COMMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = /** @type {Comment} */ (node).data;
    if (data === QUEUED || (loading && data === STREAMING)) return true;
  }
  return false;
}

/**
 * Runs `run` now if nothing is pending, else on the first poll after the last
 * pending boundary was revealed (or after MAX_WAIT_MS, so a stream that never
 * finishes cannot hold the update forever). Calls made in order run in order.
 * @param {() => void} run
 */
export function afterStreamSettled(run) {
  if (typeof document === "undefined" || !hasPendingBoundary()) {
    run();
    return;
  }
  const started = Date.now();
  const check = () => {
    if (!hasPendingBoundary() || Date.now() - started > MAX_WAIT_MS) run();
    else setTimeout(check, POLL_MS);
  };
  setTimeout(check, POLL_MS);
}
