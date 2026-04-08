"use client";

import { useEffect, useState } from "react";

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
 */
export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);

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
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };
    const leave = () => setVisible(false);
    const enter = () => setVisible(true);

    const checkHover = (e) => {
      const target = e.target;
      if (
        target &&
        target.closest &&
        target.closest('a, button, [role="button"], input, textarea, select, label')
      ) {
        setHovered(true);
      } else {
        setHovered(false);
      }
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
