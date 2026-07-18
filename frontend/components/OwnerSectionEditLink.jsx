"use client";

/**
 * Module:   OwnerSectionEditLink
 * Purpose:  Owner-only per-section edit affordance on the public business
 *           page (MEH-1306) — a calm muted pencil beside a mapped section
 *           that deep-links into the matching edit-accordion card
 *           (#anchor auto-expands via the MEH-1116 applyHash contract).
 * Does NOT: edit in place, call any API, or render for non-owners — every
 *           non-owner viewer gets 0 DOM (zero reserved space, zero CLS).
 *           Mirrors OwnerEditBar's self-gating so parents mount it
 *           unconditionally.
 * Related:  app/[locale]/producer/[id]/components/OwnerEditBar.jsx:34 (the
 *           ownership-gate pattern, MEH-1209);
 *           app/[locale]/producer/dashboard/edit/page.js ANCHOR_TO_KEY (the
 *           deep-link contract this reuses — READ-ONLY, never edited here).
 * History:  MEH-1306 (creation).
 */

import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PencilSimple } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth-context";

export default function OwnerSectionEditLink({
  producerId,
  // Edit-page anchor (public deep-link contract: bio / images / products /
  // contact-channels / location — existing ANCHOR_TO_KEY entries only).
  anchor,
  // Label key under producer.detail.section_edit.labels — feeds the aria-label.
  sectionKey,
  className = "",
}) {
  const { user } = useAuth();
  const t = useTranslations("producer.detail.section_edit");

  // Ownership gate — the ONLY render condition (REUSES: OwnerEditBar.jsx:34 —
  // a truthy producerId guards the null === null false-positive).
  const isOwner = !!producerId && user?.producer_id === producerId;
  if (!isOwner) return null;

  return (
    <LocaleLink
      href={`/producer/dashboard/edit#${anchor}`}
      aria-label={t("aria", { section: t(`labels.${sectionKey}`) })}
      data-testid={`section-edit-${sectionKey}`}
      // Calm idiom (ADR-019): muted glyph, never a primary CTA. min-h/w 44px
      // keeps the tap target ≥44px (MEH-813) around the small pencil.
      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-fg-muted hover:text-accent focus-visible:text-accent transition-colors shrink-0 ${className}`}
    >
      <PencilSimple size={18} weight="regular" aria-hidden="true" />
    </LocaleLink>
  );
}
