"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Note, SealCheck } from "@phosphor-icons/react";
import { allBadges, topBadges } from "@/lib/badges";

/**
 * BadgeRow — horizontal row of pill badges for a producer (MEH-18).
 *
 * MEH-76 chunk 4 (S12 spec): the temporary "מאומת" pill is replaced by the
 * S12 tier chip/seal, rendered from the live ADR-022 public contract
 * (verification_tier / verified_at / verification_doc_type — MEH-762):
 *   verified + license   → gold seal chip + verified_tooltip_license({date})
 *   verified + exemption → gold seal chip + verified_tooltip_exemption({date})
 *   verified + cosmetics → gold seal chip, NO tooltip (key not yet locked —
 *                          MEH-758 micro; flip to verified_tooltip_registration
 *                          once Sapir locks it)
 *   declared             → calm chip + declared_explainer (hero surface only)
 *   null                 → no badge, no negative tag (ADR-022 gate 1)
 *
 * `surface` (S12 §04): "hero" (default — full chip with the word) or "card"
 * (icon-only seal; declared renders NOTHING on cards — no placeholder).
 * {date} renders d.m.yyyy LTR-isolated (LRI/PDI) inside the RTL strings.
 *
 * Props:
 *   producer — producer object (bools + computed fields from /producers)
 *   limit    — optional max number to render (used by ProducerCard)
 *   surface  — "hero" | "card" tier-badge density (default "hero")
 *
 * Each badge is clickable: tap opens a small popover below with a
 * Hebrew explainer. Outside click + Esc closes. Works on mobile
 * without requiring hover.
 */
export default function BadgeRow({ producer, limit, surface = "hero" }) {
  const t = useTranslations("producer.badge_row");
  const tTier = useTranslations("producer.badge");
  const badges = limit != null ? topBadges(producer, limit) : allBadges(producer);
  const showDeclared = producer?.verification_tier === "declared" && surface === "hero";
  if (badges.length === 0 && !showDeclared) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="list"
      aria-label={t("aria")}
    >
      {badges.map((b) =>
        b.key === "verified" ? (
          <VerifiedTierBadge key="verified" producer={producer} surface={surface} t={tTier} />
        ) : (
          <Badge key={b.key} badge={b} />
        ),
      )}
      {showDeclared && <DeclaredTierBadge t={tTier} />}
    </div>
  );
}

// MEH-730: v4 chip recolor (Phase 2 freeze). Green chips carry cream
// (`background`) text per the design's --background fill; the gold chip keeps
// white — cream-on-accent measures 4.48:1, a hair under AA for 12px text
// (white = 5.08:1 ✓). Neutral chips move green-50 → surface-card with
// green-700 ink (v4 --bg-card / --green-dark; green-700 is the closest
// existing token — no third green per ADR-019).
const COLOR_CLASSES = {
  primary: "bg-primary text-background",
  accent: "bg-accent text-white",
  secondary: "bg-primary text-background",
  muted: "bg-surface-card text-green-700 border border-border",
};

/** Outside-click + Esc dismissal shared by every popover badge. */
function useDismissablePopover(open, setOpen, wrapRef) {
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
  }, [open, setOpen, wrapRef]);
}

/** d.m.yyyy from a date-only ISO string, LRI/PDI-isolated (S12 bidi lock). */
function formatTierDate(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = String(isoDate).split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  return `\u2066${d}.${m}.${y}\u2069`;
}

/** Locked tooltip per doc type — null = render chip without a popover. */
function getVerifiedTooltip(producer, t) {
  const date = formatTierDate(producer?.verified_at);
  if (!date) return null;
  switch (producer?.verification_doc_type) {
    case "license":
      return t("verified_tooltip_license", { date });
    case "exemption":
      return t("verified_tooltip_exemption", { date });
    default:
      // cosmetics — tooltip key not locked yet (MEH-758 micro): seal only.
      return null;
  }
}

/**
 * S12 verified chip/seal — gold seal glyph; the word "מאומת" only on the
 * hero surface (cards drop to icon-only so the name stays the hero).
 */
function VerifiedTierBadge({ producer, surface, t }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useDismissablePopover(open, setOpen, wrapRef);

  const tooltip = getVerifiedTooltip(producer, t);
  const ariaLabel = tooltip ? t("aria_verified", { tooltip }) : t("aria_verified_plain");
  const iconOnly = surface === "card";

  return (
    <span ref={wrapRef} role="listitem" className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          // The chip is interactive in its own right — never let the tap
          // bubble into the ProducerCard Link (S12 §03: first tap shows,
          // never navigates).
          e.stopPropagation();
          e.preventDefault();
          if (tooltip) setOpen((v) => !v);
        }}
        aria-expanded={tooltip ? open : undefined}
        aria-label={ariaLabel}
        data-badge="verified"
        className={
          iconOnly
            ? // Card seal sits over the photo (shipped Assembly-v2 slot) —
              // surface-card backing keeps the gold glyph legible there.
              "inline-flex items-center rounded-full bg-surface-card border border-accent/40 text-accent p-1 focus-visible:ring-2 focus-visible:ring-accent/40"
            : "inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 text-accent text-xs px-2.5 py-0.5 font-medium focus-visible:ring-2 focus-visible:ring-accent/40 transition"
        }
      >
        <SealCheck size={iconOnly ? 16 : 14} aria-hidden="true" />
        {!iconOnly && t("verified_label")}
      </button>
      {open && tooltip && (
        <span
          role="tooltip"
          data-testid="badge-tooltip-verified"
          className="absolute top-full mt-2 start-0 z-[800] bg-white border border-border rounded-md shadow-lg p-3 text-xs text-text leading-relaxed w-52 text-start"
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}

/**
 * S12 state 3 — declared. A calm affirmative chip (never a negative marker),
 * hero surface only; cards and map show nothing for declared businesses.
 */
function DeclaredTierBadge({ t }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useDismissablePopover(open, setOpen, wrapRef);

  return (
    <span ref={wrapRef} role="listitem" className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={t("aria_declared")}
        data-badge="declared"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-card text-primary-dark text-xs px-2.5 py-0.5 font-medium focus-visible:ring-2 focus-visible:ring-primary/40 transition"
      >
        <Note size={14} aria-hidden="true" />
        {t("declared_label")}
      </button>
      {open && (
        <span
          role="tooltip"
          data-testid="badge-tooltip-declared"
          className="absolute top-full mt-2 start-0 z-[800] bg-white border border-border rounded-md shadow-lg p-3 text-xs text-text leading-relaxed w-60 text-start"
        >
          {t("declared_explainer")}
        </span>
      )}
    </span>
  );
}

function Badge({ badge }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useDismissablePopover(open, setOpen, wrapRef);

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
          className="absolute top-full mt-2 start-0 z-[800] bg-white border border-border rounded-md shadow-lg p-3 text-xs text-text leading-relaxed w-52 text-start"
        >
          {badge.tooltip}
        </span>
      )}
    </span>
  );
}
