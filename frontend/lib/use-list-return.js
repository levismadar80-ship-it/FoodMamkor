// @ts-check
"use client";

/**
 * Module:   use-list-return
 * Purpose:  Back from a card on an infinite-scroll list returns the reader to
 *           the pages she had loaded and to her place in them, the way the big
 *           sites do (Etsy, Airbnb, Wolt).
 * Touches:  sessionStorage key `list-return:<key>` (this tab only).
 * Does NOT: decide whether a mount is a history return — that is
 *           consumeHistoryReturn() in lib/route-memory.js; and it does not
 *           fetch: the pages come back from what was already loaded.
 * Related:  lib/use-home-page.js (the homepage's own MEH-23/MEH-2714 restore of
 *           a "load more" count, the same click-capture stash),
 *           components/ProducersClient.jsx (the first caller),
 *           e2e/flows/manual/nav-throttled.spec.ts (the guard).
 * History:  MEH-3810 — on /producers, scrolling loaded a second page; Back
 *           remounted the list with the server's first page only, so the card
 *           the reader opened no longer existed and she landed ~750 px away
 *           (staging, 25/11, 3 of 3 runs).
 */
import { useEffect, useRef } from "react";
import { consumeHistoryReturn } from "@/lib/route-memory";

const PREFIX = "list-return:";
/** Above this many loaded rows nothing is saved: the list starts over. */
export const MAX_RESTORED_ITEMS = 240;
const RESTORE_TOLERANCE_PX = 100;
/** Frames to wait for the restored rows to make the page tall enough. */
const REACH_WAIT_FRAMES = 120;

/**
 * @typedef {{ items: any[], nextPage: number, hasMore: boolean, total: number }} ListPages
 * @param {{
 *   key: string,
 *   enabled: boolean,
 *   pages: ListPages,
 *   restore: (saved: ListPages) => void,
 * }} opts
 *  `enabled` false (a filter or a non-default sort is on) clears the stash, so
 *  a filtered list is never restored as the plain one.
 */
export function useListReturn({ key, enabled, pages, restore }) {
  const latest = useRef({ enabled, pages, restore });
  // Read by the click stash, which runs after every render that matters.
  useEffect(() => {
    latest.current = { enabled, pages, restore };
  });
  const ran = useRef(false);

  useEffect(() => {
    // consumeHistoryReturn() consumes module state; StrictMode runs this twice.
    if (ran.current) return;
    ran.current = true;
    if (!consumeHistoryReturn()) return;
    const saved = readSaved(key);
    if (!saved) return;
    latest.current.restore(saved.pages);
    scrollWhenReachable(saved.y);
  }, [key]);

  useEffect(() => {
    const stash = () => writeSaved(key, latest.current);
    // A client-side navigation never fires pagehide: stash on the link click
    // itself, capture phase, before the router moves anything (use-home-page.js).
    const onClick = (/** @type {MouseEvent} */ e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (a && /** @type {HTMLAnchorElement} */ (a).target !== "_blank") stash();
    };
    window.addEventListener("pagehide", stash);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pagehide", stash);
      document.removeEventListener("click", onClick, true);
    };
  }, [key]);
}

/** @param {string} key @param {{ enabled: boolean, pages: ListPages }} cur */
function writeSaved(key, { enabled, pages }) {
  try {
    if (!enabled || pages.items.length === 0 || pages.items.length > MAX_RESTORED_ITEMS) {
      window.sessionStorage.removeItem(PREFIX + key);
      return;
    }
    const entry = { search: window.location.search, y: window.scrollY, pages };
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // private mode or a full quota — Back then starts the list over, as before.
  }
}

/** @param {string} key @returns {{ y: number, pages: ListPages } | null} */
function readSaved(key) {
  try {
    // eslint-disable-next-line no-restricted-syntax -- restores the list and scroll on Back only, the state the visitor left (MEH-3810)
    const raw = window.sessionStorage.getItem(PREFIX + key);
    const e = raw ? JSON.parse(raw) : null;
    // Another query (a filter, ?page=N) is another list.
    if (!e || e.search !== window.location.search) return null;
    const p = e.pages;
    const ok = Array.isArray(p?.items) && Number.isFinite(p.nextPage) && typeof p.hasMore === "boolean" && Number.isFinite(e.y);
    return ok ? { y: e.y, pages: p } : null;
  } catch {
    return null;
  }
}

/** Scroll to `y` once the restored rows make it reachable; leave a correct
 *  native restore alone (overriding it moved the card, MEH-2714). */
function scrollWhenReachable(/** @type {number} */ y) {
  let frames = 0;
  const tick = () => {
    const reachable = document.documentElement.scrollHeight - window.innerHeight >= y;
    if (reachable || frames++ >= REACH_WAIT_FRAMES) {
      if (Math.abs(window.scrollY - y) > RESTORE_TOLERANCE_PX) window.scrollTo(0, y);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
