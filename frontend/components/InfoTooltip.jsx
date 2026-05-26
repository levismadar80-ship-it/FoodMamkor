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

  useEffect(() => {
    if (!open) return;

    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handlePointerDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
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
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
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
