"use client";

/**
 * Module:   OwnerEditBar (public producer detail page)
 * Purpose:  Owner-only affordance on the public business page — the page the
 *           owner opens to see how her business looks. In-flow bar above the
 *           h1 with a single link to the edit surface. Pattern: Google Business
 *           Profile / Instagram (edit lives where the content lives, not under
 *           settings).
 * Touches:  none — reads user.producer_id from useAuth() (serialized by
 *           /auth/me → UserOut). No backend call.
 * Does NOT: switch view modes, toggle "view as owner", or float over the page.
 *           Non-owners get 0 DOM (zero reserved space, zero CLS).
 * Related:  ProducerDetail.jsx (mount site, above the header),
 *           producer/dashboard/ChangesRequestedBanner.jsx (in-flow conditional
 *           banner precedent), producer/dashboard/edit/page.js (link target).
 * History:  MEH-1209 (creation).
 */

import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PencilSimple } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth-context";

export default function OwnerEditBar({ producer }) {
  const { user } = useAuth();
  const t = useTranslations();

  // Ownership gate — the ONLY render condition. Guest / consumer / other
  // producer / admin all fall through to null (no bar, no reserved space).
  // producer_id is null for non-producers, so a null === null false-positive
  // is guarded by requiring a truthy producer.id too.
  const isOwner = !!producer?.id && user?.producer_id === producer.id;
  if (!isOwner) return null;

  return (
    <div
      className="flex items-center gap-2 mb-4 bg-accent/10 border border-accent/30 rounded-[12px] px-4 py-2 text-sm"
      role="note"
      aria-label={t("producer.detail.owner_bar.aria")}
    >
      <PencilSimple size={18} weight="regular" className="text-accent shrink-0" aria-hidden="true" />
      {/* Label truncates before the CTA so 375px stays one line, no wrap. */}
      <span className="text-text truncate">{t("producer.detail.owner_bar.label")}</span>
      {/* CTA pinned to the inline-end; min-h-[44px] keeps the tap target ≥44px
          (MEH-813). The pencil icon + accent link colour carry the edit
          affordance (MEH-868 / MEH-1146 fix 12 — no static underline glyph). */}
      <LocaleLink
        href="/producer/dashboard/edit"
        data-testid="owner-edit-cta"
        className="ms-auto shrink-0 inline-flex items-center min-h-[44px] font-medium text-accent hover:underline focus-visible:underline"
      >
        {t("producer.detail.owner_bar.cta")}
      </LocaleLink>
    </div>
  );
}
