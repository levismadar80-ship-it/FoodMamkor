"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react";

/**
 * Module:   BackToTop
 * Purpose:  Floating "back to top" button for long scrolling pages (home +
 *           /producers). Hidden on load; appears once the user has scrolled
 *           past two viewport heights; a tap smooth-scrolls back to the top.
 * Touches:  window scroll position only — no API, no storage, no analytics.
 * Does NOT: mount globally. It is opted in per-page (page.js, ProducersClient)
 *           so it never appears on /map or short routes. There is no "scroll
 *           down" / "show less" twin — top-ward only (MEH-1309 scope).
 * Related:  frontend/components/ChatWidget.jsx (the bottom-END chat FAB this
 *           button stacks ABOVE — same `--cookie-banner-h` clearance pattern,
 *           MEH-850); .claude/rules/rtl.md "Floating-elements corner ownership".
 * History:  MEH-1309 (creation).
 */

// Appear only after the user has scrolled past this many viewport heights — deep
// enough that a jump-to-top is genuinely useful, not on a casual first scroll.
const REVEAL_VIEWPORTS = 2;

// Vertical clearance so the button stacks ABOVE the chat FAB rather than
// contending for the same bottom-END corner (rtl.md corner-ownership rule).
// Mobile mirrors ChatWidget's own calc — safe-area + pill-clearance(88px) +
// the live cookie-banner height — then adds the FAB's own height + a gap (60px)
// to sit just above it. Desktop mirrors the FAB's fixed 24px bottom + 60px.
const BOTTOM_MOBILE =
  "calc(env(safe-area-inset-bottom) + 88px + var(--cookie-banner-h, 0px) + 60px)";
const BOTTOM_DESKTOP = "84px";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Desktop vs mobile — drives the bottom offset (same md breakpoint as
  // ChatWidget so the two FABs share a clearance model).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // rAF-throttled scroll listener — one state write per frame at most.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ticking = false;
    const update = () => {
      setVisible(window.scrollY > window.innerHeight * REVEAL_VIEWPORTS);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update(); // set initial state on mount
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const handleClick = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="חזרה לראש העמוד"
      className="fixed end-4 z-[1000] flex items-center justify-center w-12 h-12 rounded-full bg-background text-primary border border-border shadow-lg hover:bg-green-50 transition-colors focus-ring"
      style={{ bottom: isDesktop ? BOTTOM_DESKTOP : BOTTOM_MOBILE }}
    >
      <ArrowUp size={22} weight="bold" aria-hidden="true" />
    </button>
  );
}
