"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { allBadges, topBadges } from "@/lib/badges";

/**
 * BadgeRow — horizontal row of pill badges for a producer (MEH-18).
 *
 * Props:
 *   producer — producer object (bools + computed fields from /producers)
 *   limit    — optional max number to render (used by ProducerCard)
 *
 * Each badge is clickable: tap opens a small popover below with a
 * Hebrew explainer. Outside click + Esc closes. Works on mobile
 * without requiring hover.
 */
export default function BadgeRow({ producer, limit }) {
  const t = useTranslations("producer.badge_row");
  const badges = limit != null ? topBadges(producer, limit) : allBadges(producer);
  if (badges.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="list"
      aria-label={t("aria")}
    >
      {badges.map((b) => (
        <Badge key={b.key} badge={b} />
      ))}
    </div>
  );
}

const COLOR_CLASSES = {
  primary: "bg-primary text-white",
  accent: "bg-accent text-white",
  secondary: "bg-secondary text-white",
  muted: "bg-light text-site-text border border-border",
};

function Badge({ badge }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const colorClass = COLOR_CLASSES[badge.color] || COLOR_CLASSES.muted;

  return (
    <span ref={wrapRef} role="listitem" className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          // Don't let the badge click bubble up to the ProducerCard's
          // handleRootClick / Link wrapper — the badge is interactive
          // in its own right and the outer card shouldn't navigate.
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={`${badge.label} — ${badge.tooltip}`}
        data-badge={badge.key}
        className={`text-xs px-2.5 py-0.5 rounded-full font-medium focus-visible:ring-2 focus-visible:ring-primary/40 transition ${colorClass}`}
      >
        {badge.label}
      </button>
      {open && (
        <span
          role="tooltip"
          data-testid={`badge-tooltip-${badge.key}`}
          className="absolute top-full mt-2 start-0 z-[800] bg-white border border-border rounded-[10px] shadow-lg p-3 text-xs text-site-text leading-relaxed w-52 text-right"
        >
          {badge.tooltip}
        </span>
      )}
    </span>
  );
}
