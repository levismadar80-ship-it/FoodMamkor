"use client";

import { cloneElement } from "react";
import { useTranslations } from "next-intl";
import { CaretLeft, SealCheck } from "@phosphor-icons/react";
import { Link as LocaleLink } from "@/i18n/navigation";
import { allBadges, topBadges } from "@/lib/badges";
import { CODE_TO_KEY } from "@/components/KashrutBadgeStrip";
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
 *   declared             → NO chip on any surface (MEH-1170: the S12 "מוצהר"
 *                          chip contradicted ADR-022 "tier 2 = no badge"; the
 *                          declared_explainer moved to ProducerHeader as quiet
 *                          visible copy — ADR-022 gate 1 "affirmatively explained")
 *   null                 → no badge, no negative tag (ADR-022 gate 1)
 *
 * `surface` (S12 §04): "hero" (default — full chip with the word) or "card"
 * (icon-only seal). Declared renders nothing on either surface.
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
// MEH-1711: the card badge names the CERTIFICATION, not a word we invented.
// `CODE_TO_KEY` is imported from KashrutBadgeStrip — the detail page's owner of
// that map — rather than copied, so the two surfaces cannot drift apart. That
// import is also what preserves the map's WHITELIST role
// (KashrutBadgeStrip.jsx:144 filters unknown codes through it); deriving the
// key with `code.replace(/-/g,"_")` would have produced the same string for
// known codes while silently accepting unknown ones.
//
// Filter BEFORE counting, deliberately: the detail page renders the filtered
// set, so counting raw codes could show "חלק" there and the fallback here for
// the same producer — the exact cross-surface disagreement this ticket closes.
//
// Zero or 2+ codes -> the locked fallback. Naming one certificate out of two
// would be a misstatement, and naming none is the honest state; both are the
// MEH-986 / MEH-1259 legal-compliance posture, not a display preference.
function kosherLabel(producer, tKashrut, fallback) {
  const codes = (producer?.kashrut_badges ?? []).filter((code) => CODE_TO_KEY[code]);
  if (codes.length !== 1) return fallback;
  return tKashrut(`badges.${CODE_TO_KEY[codes[0]]}.label`);
}

/**
 * The one entry point every surface that renders a badge label must call.
 *
 * MEH-1711 resolved the label inside BadgeRow's own `.map`, which fixed the
 * visible pills and left one surface behind: ProducerCard builds the `+N`
 * overflow list straight from `allBadges(producer)` (ProducerCard.jsx:349-356)
 * and reads `b.label` off BADGE_CONFIG, never passing through BadgeRow at all.
 * A kosher pill in position 3+ therefore said the fallback while the detail
 * page said "חלק" — the original three-surface contradiction surviving on the
 * one surface nobody was looking at.
 *
 * Exported rather than duplicated so the overflow cannot drift from the pill:
 * the resolution rule (filter through CODE_TO_KEY, then count) lives here once.
 * Every other badge is returned untouched — this is a label resolver, not a
 * badge filter, and it must not become one.
 */
export function resolveBadgeLabel(badge, producer, tKashrut) {
  return badge.key === "kosher" ? kosherLabel(producer, tKashrut, badge.label) : badge.label;
}

export default function BadgeRow({ producer, limit, surface = "hero", hideKeys, avoidRef = null }) {
  const t = useTranslations("producer.badge_row");
  const tTier = useTranslations("producer.badge");
  // MEH-1711: same namespace KashrutBadgeStrip.jsx:115 uses, so both surfaces
  // read the identical `kashrut.badges.*.label` strings.
  const tKashrut = useTranslations("kashrut");
  const all = limit != null ? topBadges(producer, limit) : allBadges(producer);
  // MEH-1124 (MEH-1074 Task C): optional per-surface suppression. The producer
  // detail header passes hideKeys={["products", "delivery"]} — the products
  // badge is meaningless next to the page's own products section, and delivery
  // is rendered once in the header's capability strip instead. Card surfaces
  // omit the prop, so their badge set is byte-unchanged (lib/badges.js is SoT).
  const badges = hideKeys?.length ? all.filter((b) => !hideKeys.includes(b.key)) : all;
  if (badges.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="list"
      aria-label={t("aria")}
    >
      {badges.map((b) =>
        b.key === "verified" ? (
          <VerifiedTierBadge key="verified" producer={producer} surface={surface} t={tTier} avoidRef={avoidRef} />
        ) : (
          // MEH-1711: only the kosher pill's LABEL is swapped. earnsBadge, the
          // badge set, the ordering, and the max-2 cap are untouched — this
          // changes what the pill says, never who earns it.
          <Badge
            key={b.key}
            badge={{ ...b, label: resolveBadgeLabel(b, producer, tKashrut) }}
            surface={surface}
            avoidRef={avoidRef}
          />
        ),
      )}
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
function VerifiedTierBadge({ producer, surface, t, avoidRef = null }) {
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

  // MEH-1334: the hero seal gets the richer verification popover — the manual
  // approval + licensing story (DNA-LOCK differentiator) was invisible behind
  // a date-only tooltip. Content = the LOCKED v3 copy exactly: title + body +
  // link out. MEH-1840: the link target moved /about#verification → /about/process
  // — the acceptance-process page is the canonical "how we vet" surface, while the
  // /about section is a summary. The #verification anchor stays live on /about
  // (AboutClient.jsx) so existing deep-links keep resolving. Same retarget applied
  // to the duplicate popover in ImageGallery.jsx (masthead seal) — the two must
  // not diverge, they render identically on the same producer page.
  // The pre-existing MEH-762 doc-date line is intentionally dropped
  // here — the locked copy is dateless (chunk-2 CLARIFY c). The verified SEAL
  // itself only renders for verification_tier === "verified" (badges.js:140),
  // so this popover can never make a false trust claim on a non-verified
  // producer (CLARIFY a/b). Cards keep the compact date tooltip (surface
  // unchanged) via the non-hero branch below.
  if (surface === "hero") {
    return (
      <span role="listitem" className="inline-block">
        <Popover
          trigger={chip}
          role="dialog"
          sheetOnMobile
          contentTestId="badge-tooltip-verified"
          contentClassName="w-64 flex flex-col gap-1.5"
          sheetContentClassName="flex flex-col gap-2"
        >
          <span className="flex items-center gap-1.5 font-bold text-sm text-text">
            <SealCheck size={18} className="text-primary" weight="fill" aria-hidden="true" />
            {t("verified_popover_title")}
          </span>
          <span className="block text-[13px] leading-relaxed">{t("verified_popover_body")}</span>
          <LocaleLink
            href="/about/process"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-dark"
          >
            {t("verified_popover_link")}
            {/* Forward chevron points LEFT in RTL (MEH-1334 revision-1 #11) */}
            <CaretLeft size={13} aria-hidden="true" />
          </LocaleLink>
        </Popover>
      </span>
    );
  }

  return (
    <span role="listitem" className="inline-block">
      {tooltip ? (
        <Popover trigger={chip} contentTestId="badge-tooltip-verified" contentClassName="w-52" overlay={Boolean(avoidRef)} avoidRef={avoidRef}>
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

function Badge({ badge, surface = "hero", avoidRef = null }) {
  const colorClass = COLOR_CLASSES[badge.color] || COLOR_CLASSES.muted;

  // MEH-1492: on the HERO surface (producer detail), a badge with an aboutHref
  // (recommended → /about#editors-pick) turns its popover body into a link — the
  // locked tooltip copy becomes the clickable explainer to the criteria + the
  // ADR-030 "can't be bought" promise. Mirrors the verified seal's hero-only
  // link-out popover above (which MEH-1840 retargeted to /about/process); no new
  // copy. `recommended` still points at the /about#editors-pick anchor — that
  // section has no standalone page, so the retarget did NOT apply to it.
  // Card surfaces keep the compact plain-text tooltip (never mount a locale link).
  const linkOut = badge.aboutHref && surface === "hero";
  const popoverBody = linkOut ? (
    <LocaleLink
      href={badge.aboutHref}
      className="inline-flex items-start gap-1 font-medium text-primary hover:text-primary-dark"
    >
      <span>{badge.tooltip}</span>
      {/* Forward chevron points LEFT in RTL (mirrors the verified popover). */}
      <CaretLeft size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
    </LocaleLink>
  ) : (
    badge.tooltip
  );

  // MEH-800: click-popover routed through ui/Popover — the primitive owns
  // the toggle, Esc/outside-click dismissal, and the ProducerCard-Link tap
  // guard that used to live inline here.
  return (
    <span role="listitem" className="inline-block">
      <Popover
        contentTestId={`badge-tooltip-${badge.key}`}
        contentClassName="w-52"
        // MEH-1593: ProducerCard supplies the badge strip as the boundary, which
        // switches this popover to the MEH-1592 overlay mode. Hero surfaces pass
        // no ref and are byte-identical.
        overlay={Boolean(avoidRef)}
        avoidRef={avoidRef}
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
        {popoverBody}
      </Popover>
    </span>
  );
}
