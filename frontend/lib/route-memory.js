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
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const leftPaths = new Set();

/**
 * True when the reader has already been on — and left — the current route in
 * this document. Marked on LEAVE (effect cleanup), not on mount: sections that
 * mount late on the first visit (after their data arrives) must still animate.
 * Always false on the server and on the first hydration render, so server and
 * client markup agree.
 */
export function useRevealSkip() {
  const pathname = usePathname();
  const [skip] = useState(() => typeof window !== "undefined" && leftPaths.has(pathname));
  useEffect(() => () => leftPaths.add(pathname), [pathname]);
  return skip;
}

let popPath = null;
let documentEntryConsumed = false;
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
 * Call once per mount, from an effect. Returns true when this mount is a
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
    const type = window.performance?.getEntriesByType?.("navigation")?.[0]?.type;
    return type === "reload" || type === "back_forward";
  }
  documentEntryConsumed = true;
  return false;
}
