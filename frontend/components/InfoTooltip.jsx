"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const POSITION_CLASSES = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2", // rtl-ok: horizontal center, direction-neutral
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2", // rtl-ok: horizontal center, direction-neutral
  start: "end-full top-1/2 -translate-y-1/2 me-2",
  end: "start-full top-1/2 -translate-y-1/2 ms-2",
};

export default function InfoTooltip({
  content,
  label,
  position = "top",
}) {
  const t = useTranslations("common.info_tooltip");
  const triggerLabel = label ?? t("trigger_aria");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const tooltipId = useId();
  // MEH-2178: what `open` was BEFORE hover touched it, so a click can toggle
  // against the user's intent rather than against the hover state.
  //
  // The bug this replaces: onMouseEnter set open=true and onClick then read
  // that fresh `true` and toggled it straight back to false. A real browser
  // fires mouseenter -> pointerdown -> mousedown -> focus -> click, so the
  // opener and the toggle were fighting over one boolean and the toggle
  // always won. Result: dead glass on tap AND on click.
  const openBeforeHoverRef = useRef(false);

  // Hover is a mouse affordance only. Touch devices synthesize mouseenter
  // just before click, so an unguarded hover handler re-creates the same
  // race on mobile — which is where the ⓘ is actually used.
  const isMouse = (e) => e.pointerType === "mouse";

  useEffect(() => {
    if (!open) return;

    // Both of these close from OUTSIDE the trigger's own handlers, so they
    // must clear the baseline too. Otherwise Escape-then-click computes
    // !true === false and the click reads as a no-op (MEH-2178).
    const handleKey = (e) => {
      if (e.key === "Escape") {
        openBeforeHoverRef.current = false;
        setOpen(false);
      }
    };
    const handlePointerDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        openBeforeHoverRef.current = false;
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <span className="relative inline-block align-middle" ref={wrapperRef}>
      <button
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => {
          // Toggle the pre-hover baseline, not the current value.
          const next = !openBeforeHoverRef.current;
          openBeforeHoverRef.current = next;
          setOpen(next);
        }}
        onPointerEnter={(e) => {
          if (!isMouse(e)) return;
          openBeforeHoverRef.current = open;
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (!isMouse(e)) return;
          openBeforeHoverRef.current = false;
          setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          openBeforeHoverRef.current = false;
          setOpen(false);
        }}
        className="inline-flex items-center justify-center w-4 h-4 mx-1 rounded-full border border-fg-muted/40 text-fg-muted text-[10px] leading-none hover:bg-fg-muted/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute z-[9999] whitespace-normal w-56 bg-[#1C1A17] text-white text-[11px] leading-relaxed rounded-[8px] px-[10px] py-[6px] shadow-lg ${POSITION_CLASSES[position] ?? POSITION_CLASSES.top}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
