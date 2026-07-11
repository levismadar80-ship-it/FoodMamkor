"use client";

import { cloneElement } from "react";
import { useTranslations } from "next-intl";
import { Note, SealCheck } from "@phosphor-icons/react";
import { allBadges, topBadges } from "@/lib/badges";
import Popover from "@/components/ui/Popover";

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
export default function BadgeRow({ producer, limit, surface = "hero", hideKeys }) {
  const t = useTranslations("producer.badge_row");
  const tTier = useTranslations("producer.badge");
  const all = limit != null ? topBadges(producer, limit) : allBadges(producer);
  // MEH-1124 (MEH-1074 Task C): optional per-surface suppression. The producer
  // detail header passes hideKeys={["products", "delivery"]} — the products
  // badge is meaningless next to the page's own products section, and delivery
  // is rendered once in the header's capability strip instead. Card surfaces
  // omit the prop, so their badge set is byte-unchanged (lib/badges.js is SoT).
  const badges = hideKeys?.length ? all.filter((b) => !hideKeys.includes(b.key)) : all;
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
  const tooltip = getVerifiedTooltip(producer, t);
  const ariaLabel = tooltip ? t("aria_verified", { tooltip }) : t("aria_verified_plain");
  const iconOnly = surface === "card";

  // MEH-800: the chip carries no onClick of its own in the popover branch —
  // ui/Popover injects the toggle + the card-Link tap guard (S12 §03).
  // MEH-813: outer <button> is a transparent ≥24×24 hit-area (WCAG 2.5.8 AA).
  // The visible pill lives in the inner <span> so bg/border/padding/text stay
  // byte-identical to pre-MEH-813. Focus ring stays around the pill (not the
  // larger hit-box) via group-focus-visible so ring geometry is unchanged.
  // The iconOnly seal was already 26×26 (border + p-1 + 16px glyph); min-h/-w
  // here are defensive parity, not a visual delta.
  const chip = (
    <button
      type="button"
      aria-label={ariaLabel}
      data-badge="verified"
      className="group inline-flex items-center justify-center min-h-[24px] min-w-[24px] focus:outline-none"
    >
      <span
        className={
          iconOnly
            ? // Card seal sits over the photo (shipped Assembly-v2 slot) —
              // surface-card backing keeps the gold glyph legible there.
              "inline-flex items-center rounded-full bg-surface-card border border-accent/40 text-accent p-1 group-focus-visible:ring-2 group-focus-visible:ring-accent/40"
            : "inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 text-accent text-xs px-2.5 py-0.5 font-medium group-focus-visible:ring-2 group-focus-visible:ring-accent/40 transition"
        }
      >
        <SealCheck size={iconOnly ? 16 : 14} aria-hidden="true" />
        {!iconOnly && t("verified_label")}
      </span>
    </button>
  );

  return (
    <span role="listitem" className="inline-block">
      {tooltip ? (
        <Popover trigger={chip} contentTestId="badge-tooltip-verified" contentClassName="w-52">
          {tooltip}
        </Popover>
      ) : (
        // cosmetics — seal only, no popover (MEH-758 micro); keep the
        // card-Link tap guard the popover branch gets from ui/Popover.
        <span className="relative inline-block">
          {cloneElement(chip, {
            onClick: (e) => {
              e.stopPropagation();
              e.preventDefault();
            },
          })}
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
  return (
    <span role="listitem" className="inline-block">
      <Popover
        contentTestId="badge-tooltip-declared"
        contentClassName="w-60"
        trigger={
          // MEH-813: outer button = ≥24×24 hit-area (WCAG 2.5.8 AA); visible
          // pill in inner span keeps byte-identical bg/border/padding.
          <button
            type="button"
            aria-label={t("aria_declared")}
            data-badge="declared"
            className="group inline-flex items-center justify-center min-h-[24px] min-w-[24px] focus:outline-none"
          >
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-card text-primary-dark text-xs px-2.5 py-0.5 font-medium group-focus-visible:ring-2 group-focus-visible:ring-primary/40 transition">
              <Note size={14} aria-hidden="true" />
              {t("declared_label")}
            </span>
          </button>
        }
      >
        {t("declared_explainer")}
      </Popover>
    </span>
  );
}

function Badge({ badge }) {
  const colorClass = COLOR_CLASSES[badge.color] || COLOR_CLASSES.muted;

  // MEH-800: click-popover routed through ui/Popover — the primitive owns
  // the toggle, Esc/outside-click dismissal, and the ProducerCard-Link tap
  // guard that used to live inline here.
  return (
    <span role="listitem" className="inline-block">
      <Popover
        contentTestId={`badge-tooltip-${badge.key}`}
        contentClassName="w-52"
        trigger={
          // MEH-813: outer button = ≥24×24 hit-area (WCAG 2.5.8 AA); visible
          // pill in inner span keeps byte-identical bg/border/padding.
          <button
            type="button"
            aria-label={`${badge.label} — ${badge.tooltip}`}
            data-badge={badge.key}
            className="group inline-flex items-center justify-center min-h-[24px] min-w-[24px] focus:outline-none"
          >
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium group-focus-visible:ring-2 group-focus-visible:ring-primary/40 transition ${colorClass}`}>
              {badge.label}
            </span>
          </button>
        }
      >
        {badge.tooltip}
      </Popover>
    </span>
  );
}
