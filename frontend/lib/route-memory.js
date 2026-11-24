// @ts-check
"use client";

/**
 * Module:   route-memory
 * Purpose:  Two small facts about client-side navigation that the page
 *           components cannot learn on their own:
 *           1. useRevealSkip() — has the reader already been on this route in
 *              this tab? Entrance animations (fade + slide) play on the first
 *              visit only; coming BACK to a list shows it as it was.
 *           2. consumeHistoryReturn() — is this mount a return through the
 *              browser history (back / forward / reload), as opposed to a fresh
 *              arrival through a link (e.g. the logo)?
 * History:  MEH-2714 — on the homepage, back from a business card replayed the
 *           card entrance (cards at opacity 0 for ~0.5s), which read as "the
 *           whole page rendered again"; and a scroll position stashed by an
 *           earlier reload was restored on a plain logo click, landing the
 *           reader mid-page instead of at the top.
 *
 * Module state lives for the life of the JS document: a full reload starts
 * fresh, a client-side navigation keeps it. That is exactly the boundary we
 * want — a reload is a new visit, a back-navigation is not.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const leftPaths = new Set();
let popPath = null;
let documentEntryConsumed = false;

/**
 * Route-level: records a path as LEFT when the pathname actually changes.
 * Mounted once, in the root layout (SmoothScrollProvider), so a block that
 * unmounts while the reader stays on the route (a conditional section, a
 * skeleton→content swap) never marks it — only leaving the route does.
 */
export function useTrackRouteLeaves() {
  const pathname = usePathname();
  const prev = useRef(null);
  // Compared against the previous path, not done in a cleanup: StrictMode's
  // dev mount→cleanup→mount would otherwise mark the route the reader is on.
  useEffect(() => {
    if (prev.current !== null && prev.current !== pathname) {
      leftPaths.add(prev.current);
      // A history step that was for another route (e.g. a hash step on /) and
      // was never consumed must not count for a later arrival.
      if (popPath !== null && popPath !== pathname) popPath = null;
    }
    prev.current = pathname;
  }, [pathname]);
}

/**
 * True when the reader has already been on — and left — the current route in
 * this document, by ANY way back (browser back, the logo, the bottom nav): the
 * entrance animation is a first-visit effect, so a second visit in the same
 * tab never replays it. Sections that mount late on the first visit (after their data
 * arrives) still animate, because the route is marked only on leave. Always
 * false on the server and on the first hydration render, so server and client
 * markup agree.
 */
export function useRevealSkip() {
  const pathname = usePathname();
  const [skip] = useState(() => typeof window !== "undefined" && leftPaths.has(pathname));
  return skip;
}

const entryPath = typeof window !== "undefined" ? window.location.pathname : null;

if (typeof window !== "undefined") {
  // popstate fires before the App Router renders the restored route, and
  // location already points at the destination — so the path identifies which
  // route the history step was FOR (a back to /a must not count for /b).
  window.addEventListener("popstate", () => {
    popPath = window.location.pathname;
  });
}

/**
 * Call once per mount, from an effect (behind a ref guard — the call consumes
 * module state, so a second StrictMode run must not call it again). A pending
 * back step for a route that never asks (e.g. /about) stays set until the next
 * call, which compares paths and drops it. Returns true when this mount is a
 * history return to the current route:
 *  - a client-side back/forward (popstate) that landed on this path, or
 *  - the document's own entry route, loaded by reload or back_forward.
 * A link click (push navigation) returns false.
 */
export function consumeHistoryReturn() {
  if (typeof window === "undefined") return false;
  const here = window.location.pathname;
  if (popPath !== null) {
    const hit = popPath === here;
    popPath = null;
    if (hit) {
      documentEntryConsumed = true;
      return true;
    }
  }
  if (!documentEntryConsumed && here === entryPath) {
    documentEntryConsumed = true;
    const nav = /** @type {PerformanceNavigationTiming | undefined} */ (
      window.performance?.getEntriesByType?.("navigation")?.[0]
    );
    const type = nav?.type;
    return type === "reload" || type === "back_forward";
  }
  documentEntryConsumed = true;
  return false;
}

/**
 * For a route loading fallback (every app/[locale] loading.js): put the window at
 * the top when the fallback mounts after a link click.
 *
 * Why: the App Router scrolls to the new page only when the PAGE commits, not
 * when its loading fallback shows. So after scrolling a list and tapping a
 * card, the fallback (one screen tall, MEH-2754) rendered at the OLD scroll
 * position — 900 px down on a 1.9-screen document — and the reader saw only the
 * header and the site footer until the page arrived (staging, 24/11: 0.4 s on
 * the business page, 0.8 s on an event page). The big sites (Airbnb, Wolt,
 * Etsy) open the coming page at its top straight away.
 *
 * It does NOT scroll:
 *  - on a back/forward step to this path — the browser (and the homepage's
 *    MEH-2714 restore) owns that position;
 *  - on the document's first route before any client navigation (a reload or
 *    a direct visit), where the browser restores the reload position itself.
 * A layout effect, so the jump happens before the fallback is painted.
 */
export function useScrollTopOnArrival() {
  useLayoutEffect(() => {
    const here = window.location.pathname;
    if (popPath !== null && popPath === here) return;
    if (here === entryPath && leftPaths.size === 0) return;
    if (window.scrollY === 0) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
}
