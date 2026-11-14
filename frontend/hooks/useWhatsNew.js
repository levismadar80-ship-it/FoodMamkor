// @ts-check
"use client";

/**
 * Module:   hooks/useWhatsNew
 * Purpose:  Two small client-only state holders for the dashboard home
 *           (MEH-3200): the newest «מה חדש» release the owner has not seen,
 *           and whether the one-time welcome card is still due.
 * Touches:  window.localStorage via lib/whats-new.js; a same-tab window event
 *           so the top card and the bottom row agree after a dismiss.
 * Does NOT: render anything (components/producer/WhatsNew*.jsx,
 *           OwnerWelcomeCard.jsx), or store anything on the server — seen
 *           state is per browser on purpose (no schema change, approved 14/11).
 * History:  MEH-3200 (creation).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { WHATS_NEW_SEEN_KEY, newToolHrefs, unseenRelease } from "@/lib/whats-new";

const SEEN_EVENT = "mehamakor:whats-new-seen";

/** @returns {string | null} the last version the owner marked as seen. */
function readSeenVersion() {
  try {
    return window.localStorage.getItem(WHATS_NEW_SEEN_KEY);
  } catch {
    return null;
  }
}

/** @param {string} version */
function markSeen(version) {
  try {
    window.localStorage.setItem(WHATS_NEW_SEEN_KEY, version);
  } catch {
    // Private mode / blocked storage: the card simply shows again next time.
  }
}
export const WELCOME_DISMISSED_KEY = "mehamakor.owner_welcome.dismissed";
const DAY_MS = 24 * 60 * 60 * 1000;
/** A business older than this (day 30 still counts) never sees the welcome card. */
export const WELCOME_WINDOW_DAYS = 30;

/**
 * @returns {{ release: import("@/lib/whats-new").WhatsNewRelease | null, dismiss: () => void }}
 *   release is null on the server and before mount, so SSR and the first
 *   client render agree.
 */
export function useUnseenRelease() {
  const [release, setRelease] = useState(
    /** @type {import("@/lib/whats-new").WhatsNewRelease | null} */ (null),
  );

  useEffect(() => {
    const sync = () => setRelease(unseenRelease(readSeenVersion()));
    sync();
    window.addEventListener(SEEN_EVENT, sync);
    return () => window.removeEventListener(SEEN_EVENT, sync);
  }, []);

  const dismiss = useCallback(() => {
    if (!release) return;
    markSeen(release.version);
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, [release]);

  return { release, dismiss };
}

/**
 * Tool hrefs that carry a «חדש» pill right now. Empty on the server and before
 * mount (the clock is read in an effect, so SSR and hydration agree).
 * @returns {Set<string>}
 */
export function useNewTools() {
  const [tools, setTools] = useState(() => new Set());
  useEffect(() => {
    // Keep the first empty Set when nothing is new: no extra render of
    // every dashboard page on mount (it re-ran the layout's /login effect).
    const fresh = newToolHrefs(Date.now());
    if (fresh.size > 0) setTools(fresh);
  }, []);
  return tools;
}

/** Mark every release as seen — the archive page calls this on open. */
export function markAllSeen() {
  const r = unseenRelease(readSeenVersion());
  if (!r) return;
  markSeen(r.version);
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/**
 * Is the business new enough for the welcome card?
 * @param {string | null | undefined} createdAt ISO instant of the business.
 * @param {number} now epoch ms.
 */
export function isNewBusiness(createdAt, now) {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= WELCOME_WINDOW_DAYS * DAY_MS;
}

/**
 * @param {string | null | undefined} createdAt
 * @returns {{ show: boolean, ready: boolean, dismiss: () => void }}
 *   ready — `show` has been worked out for THIS createdAt. Until then the home
 *   keeps its top slot closed, so a card never mounts and is then replaced by
 *   the welcome card (MEH-3200 part 2 review).
 */
export function useOwnerWelcome(createdAt) {
  const [show, setShow] = useState(false);
  const [evaluatedFor, setEvaluatedFor] = useState(
    /** @type {{ v: string | null | undefined } | null} */ (null),
  );
  // Holds the dismissal for this visit even when storage is blocked.
  const closed = useRef(false);

  useEffect(() => {
    let dismissed = closed.current;
    try {
      dismissed = dismissed || window.localStorage.getItem(WELCOME_DISMISSED_KEY) === "1";
    } catch {
      // blocked storage: rely on the in-memory flag
    }
    setShow(!dismissed && isNewBusiness(createdAt, Date.now()));
    setEvaluatedFor({ v: createdAt });
  }, [createdAt]);

  const dismiss = useCallback(() => {
    closed.current = true;
    try {
      window.localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    } catch {
      // blocked storage: hidden for this visit only
    }
    setShow(false);
  }, []);

  return { show, ready: evaluatedFor !== null && evaluatedFor.v === createdAt, dismiss };
}
