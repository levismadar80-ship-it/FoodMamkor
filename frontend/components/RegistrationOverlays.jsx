"use client";

/**
 * Module:   RegistrationOverlays
 * Purpose:  The two phone surfaces of the event / workshop sign-up (MEH-3043,
 *           Sapir 13/11 option ב): a sticky bar that keeps the sign-up action
 *           in reach while the inline one is off screen, and a full-screen
 *           sheet with × that holds the form (Eventbrite's mobile checkout:
 *           "the button makes use of the full screen in mobile sizes").
 * Does NOT: decide which action is offered or render the form itself —
 *           RegistrationCta.jsx owns both and passes them in as children.
 * Related:  components/RegistrationCta.jsx (the only caller),
 *           app/[locale]/producer/[id]/components/StickyContactBar.jsx (the
 *           producer page's sticky bar — same show-when-inline-is-gone rule),
 *           components/public/ProductSheet.jsx (scroll-lock + Escape + Tab
 *           trap + focus return — the modal contract copied here).
 * History:  MEH-3043 (creation).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

// Tailwind `lg` — the width where the details card becomes the desktop side
// card (EventDetailClient / ExperienceDetailClient `lg:grid`).
const DESKTOP_QUERY = "(min-width: 1024px)";

// Room at the page end while the bar is up (bar ≈ 68px + breathing space).
const BAR_ROOM = "76px";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** true on a desktop width. Unknown (no matchMedia, e.g. jsdom) → desktop,
 * so the form opens in place — the behaviour before MEH-3043. */
export function isDesktop() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

// The bottom band a phone keeps covered: the BottomNav pill (~72px + safe
// area). An inline button that sits under the pill is not "in view" — measured
// on the event page at 375: the button was half under the pill and the bar
// never came up.
const COVERED_BOTTOM = "0px 0px -96px 0px";

/** Whether `ref` is on screen (above the pill band): undefined until measured
 * (and forever where there is no IntersectionObserver), then true / false. */
export function useInView(ref, active = true) {
  const [inView, setInView] = useState(undefined);
  // `active`: the caller renders the observed node only when it has something
  // to show, so the observer (re)attaches when that turns true.
  useEffect(() => {
    if (!active) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
      rootMargin: COVERED_BOTTOM,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, active]);
  return inView;
}

/**
 * Phone only (lg:hidden). Sits on top of the BottomNav pill: its bottom is the
 * clearance BottomNav publishes (`--bottom-nav-clearance`, MEH-1950 — the
 * same var CookieBanner reads), which is the bare safe-area on routes with no
 * pill. While it shows, the chat launcher steps aside ([data-chat-hide],
 * MEH-2835).
 */
export function StickyRegistrationBar({ note, children }) {
  // While the bar is up, the page gets room for it at the end, so the last
  // lines (footer, «more events») can still scroll out from under it.
  useEffect(() => {
    if (isDesktop()) return undefined;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = BAR_ROOM;
    return () => {
      // Only undo our own write — never put back a value someone else replaced.
      if (document.body.style.paddingBottom === BAR_ROOM) document.body.style.paddingBottom = prev;
    };
  }, []);
  return (
    <div
      className="vv-pin lg:hidden fixed inset-x-0 bottom-[var(--bottom-nav-clearance,calc(env(safe-area-inset-bottom)+72px))] z-[598] bg-surface border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      data-testid="registration-bar"
      data-chat-hide=""
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        {note && <p className="flex-1 min-w-0 text-sm font-semibold text-text">{note}</p>}
        <div className={note ? "shrink-0 min-w-[55%]" : "flex-1"}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Full-screen dialog, portalled to <body> (rtl.md: a z token only ranks at the
 * root). Escape and × close it; Tab stays inside; focus returns to the opener
 * through the caller's onClose.
 */
export function RegistrationSheet({ title, closeLabel, onClose, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Focus can fall out to <body> when the focused control unmounts (the
      // submit button, once the confirmation replaces the form) — pull it back.
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="registration-sheet-title"
      className="fixed inset-0 z-[9000] bg-surface flex flex-col"
      data-testid="registration-sheet"
    >
      <div className="relative border-b border-border px-4 py-2 shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}>
        {/* × at the inline END + the heading reserves its width (rtl.md, MEH-2038). */}
        <h2 id="registration-sheet-title" className="font-semibold text-text pe-12 min-h-touch flex items-center">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute bottom-2 end-2 w-11 h-11 flex items-center justify-center rounded-full text-fg-muted hover:bg-background focus-ring"
          data-testid="registration-sheet-close"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
