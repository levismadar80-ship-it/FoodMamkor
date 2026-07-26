"use client";

import { useEffect, useRef, useState } from "react";

/** Elements that scale the cursor up. Single source for both the
 *  mousemove path and the MEH-1575 liveness re-check. */
const HOVERABLE_SELECTOR =
  'a, button, [role="button"], input, textarea, select, label';

/** MEH-1575: poll cadence while the cursor is scaled up. 100ms keeps the
 *  reset inside the 150ms bar; the timer only exists while scaled. */
const LIVENESS_POLL_MS = 100;

/** True when `el` is (or sits inside) something the cursor scales up for. */
function isHoverable(el) {
  return Boolean(el && el.closest && el.closest(HOVERABLE_SELECTOR));
}

/**
 * CustomCursor — subtle green dot that follows the mouse and scales up
 * on hoverable elements. Inspired by Graza + Simply Chocolate.
 *
 * Desktop-only: disabled on touch devices and on small screens so tap
 * targets stay natural on mobile. Respects prefers-reduced-motion.
 *
 * The native cursor is hidden globally when this component mounts and
 * restored on unmount — ensures the cursor disappears when the user
 * switches off the effect (theme toggle, unmount, etc).
 *
 * History: MEH-1575 — hover state used to be computed on mousemove only,
 * so an element vanishing under a stationary pointer left the dot stuck
 * at scale(3); a liveness poll (active only while scaled) now resolves it.
 */
export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  // Latest pointer position, readable from the poll without re-arming it
  // on every mousemove (`pos` state would restart the interval each frame).
  const posRef = useRef({ x: -100, y: -100 });

  // Decide once on mount whether to enable at all.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch =
      window.matchMedia("(hover: none)").matches ||
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0;
    const isSmall = window.matchMedia("(max-width: 768px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isTouch || isSmall || reduce) {
      setEnabled(false);
      return;
    }
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const move = (e) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };
    const leave = () => setVisible(false);
    const enter = () => setVisible(true);

    const checkHover = (e) => {
      setHovered(isHoverable(e.target));
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mousemove", checkHover);
    document.addEventListener("mouseleave", leave);
    document.addEventListener("mouseenter", enter);

    // Hide the native cursor site-wide while the custom one is active.
    const prevCursor = document.documentElement.style.cursor;
    document.documentElement.classList.add("custom-cursor-on");

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousemove", checkHover);
      document.removeEventListener("mouseleave", leave);
      document.removeEventListener("mouseenter", enter);
      document.documentElement.classList.remove("custom-cursor-on");
      document.documentElement.style.cursor = prevCursor;
    };
  }, [enabled]);

  // MEH-1575: `checkHover` above only runs on mousemove, so a hoverable
  // element that disappears under a stationary pointer (a scroll arrow
  // fading out, a chip removed by a filter toggle, a sheet closing) used
  // to leave the dot at scale(3) until the mouse moved again. While — and
  // only while — the cursor is scaled up, re-resolve what is actually under
  // the pointer and drop back to base scale once it is no longer hoverable.
  // Same predicate as `checkHover`, so hover in/out by mouse is unchanged.
  // elementFromPoint (not a MutationObserver on body) so removal, `display:
  // none`, and being covered by an overlay are all caught by one check.
  useEffect(() => {
    if (!enabled || !hovered) return;
    // jsdom (and any non-layout DOM) has no elementFromPoint — degrade to the
    // pre-MEH-1575 mousemove-only behaviour instead of throwing in a timer.
    if (typeof document.elementFromPoint !== "function") return;

    const id = setInterval(() => {
      const { x, y } = posRef.current;
      if (!isHoverable(document.elementFromPoint(x, y))) setHovered(false);
    }, LIVENESS_POLL_MS);

    return () => clearInterval(id);
  }, [enabled, hovered]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className={`custom-cursor ${hovered ? "custom-cursor--hover" : ""}`}
      style={{
        left: pos.x - 6,
        top: pos.y - 6,
        opacity: visible ? 1 : 0,
      }}
    />
  );
}
