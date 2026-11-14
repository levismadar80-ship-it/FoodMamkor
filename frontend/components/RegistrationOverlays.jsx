// @ts-check
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
 * History:  MEH-3043 (creation). MEH-3109 (floating pill, steps aside at
 *           the footer).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

// Tailwind `lg` — the width where the details card becomes the desktop side
// card (EventDetailClient / ExperienceDetailClient `lg:grid`).
const DESKTOP_QUERY = "(min-width: 1024px)";

// Room at the page end while the bar is up, on a page with no site footer:
// the layout's own bottom inset (it clears the nav pill) + pill 60px + 8px gap.
// Inline padding replaces the layout's pb class, so the inset is added back.
export const BAR_ROOM = "calc(var(--bottom-inset, 5rem) + 68px)";

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

/** Whether the site footer is on screen (BackToTop's MEH-2417 rule). null
 * when the page has no site footer or no IntersectionObserver. */
function useFooterInView() {
  const [inView, setInView] = useState(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    // The SITE footer, not the first <footer> in the document.
    const footer = document.querySelector("footer[data-site-footer]");
    if (!footer) return undefined;
    setInView(false);
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(footer);
    return () => io.disconnect();
  }, []);
  return inView;
}

/**
 * Phone only (lg:hidden). A floating pill 8px above the BottomNav pill, with
 * the nav shell's geometry (14px gutters, rounded-full) — the producer page's
 * sticky contact pill (MEH-3027) is the same shape. Its bottom is the
 * clearance BottomNav publishes (`--bottom-nav-clearance`, MEH-1950 — the
 * same var CookieBanner reads). While it shows, the chat launcher steps aside
 * ([data-chat-hide], MEH-2835).
 *
 * MEH-3109: it steps aside while the site footer is on screen (BackToTop's
 * MEH-2417 rule). Before, a full-width white strip sat over the dark footer,
 * and the room it reserved at the page end showed as a cream band under the
 * footer (Sapir, 14/11). The footer starts right after the content, so once
 * the bar hides nothing is left under it — the body padding is only needed on
 * a page with no site footer. While the cookie banner is up the pill sits
 * above it (`--cookie-banner-h`, as ChatWidget / BackToTop do).
 */
export function StickyRegistrationBar({ note, children }) {
  const footerInView = useFooterInView();
  useEffect(() => {
    // Decided in the effect itself, not from footerInView: that starts null,
    // and a first-commit write would paint the room for a frame (review).
    if (isDesktop() || document.querySelector("footer[data-site-footer]")) return undefined;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = BAR_ROOM;
    const ours = document.body.style.paddingBottom;
    return () => {
      // Only undo our own write — never put back a value someone else replaced.
      if (document.body.style.paddingBottom === ours) document.body.style.paddingBottom = prev;
    };
  }, []);
  if (footerInView) return null;
  return (
    <div
      className="vv-pin lg:hidden fixed inset-x-0 bottom-[calc(var(--bottom-nav-clearance,calc(env(safe-area-inset-bottom)+72px))+8px+var(--cookie-banner-h,0px))] z-[598] flex px-[14px] pointer-events-none"
      data-testid="registration-bar"
      data-chat-hide=""
    >
      <div
        className="pointer-events-auto w-full flex items-center gap-3 rounded-full bg-surface border border-border shadow-lg p-1.5"
        data-testid="registration-bar-pill"
      >
        {note && <p className="flex-1 min-w-0 ps-3.5 text-sm font-semibold text-text truncate">{note}</p>}
        <div className={note ? "shrink-0 basis-1/2" : "flex-1"}>{children}</div>
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
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
