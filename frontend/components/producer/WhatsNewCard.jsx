// @ts-check
"use client";

/**
 * Module:   WhatsNewCard
 * Purpose:  «חדש במהמקור» — the top-of-home card that shows the newest release
 *           lines until the owner closes it or opens the archive (MEH-3200,
 *           placement א׳ chosen by Sapir 14/11).
 * Does NOT: decide what is unseen (hooks/useWhatsNew.js) or list old releases
 *           (dashboard/whats-new/page.js). The fixed row is WhatsNewRow.jsx.
 * History:  MEH-3200 (creation).
 */

import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { useUnseenRelease } from "@/hooks/useWhatsNew";

export const WHATS_NEW_HREF = "/producer/dashboard/whats-new";

/** @param {{ releaseKey: string, count: number, className?: string }} props */
export function ReleaseLines({ releaseKey, count, className = "" }) {
  const t = useTranslations("dashboard.producer.whats_new.releases");
  return (
    <ul className={`space-y-1.5 text-sm text-text list-disc ps-5 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>{t(`${releaseKey}.i${i}`)}</li>
      ))}
    </ul>
  );
}

export default function WhatsNewCard() {
  const t = useTranslations("dashboard.producer.whats_new");
  const { release, dismiss } = useUnseenRelease();
  if (!release) return null;
  return (
    <section
      data-testid="whats-new-card"
      aria-labelledby="whats-new-card-heading"
      className="bg-surface border border-primary rounded-lg p-4 mb-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="whats-new-card-heading" className="font-semibold text-text pt-2">
          {t("card_title")}
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("card_close")}
          data-testid="whats-new-close"
          className="w-11 h-11 -me-2 -mt-1 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <ReleaseLines releaseKey={release.key} count={release.items} className="mt-1" />
      <Link
        href={WHATS_NEW_HREF}
        onClick={dismiss}
        data-testid="whats-new-all"
        className="min-h-touch inline-flex items-center mt-1 text-sm text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current"
      >
        {t("card_all")}
      </Link>
    </section>
  );
}
