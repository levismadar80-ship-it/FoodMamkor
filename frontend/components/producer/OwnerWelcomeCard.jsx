// @ts-check
"use client";

/**
 * Module:   OwnerWelcomeCard
 * Purpose:  A one-time «ברוכים הבאים למהמקור» note from the founders (Sapir + Topaz, MEH-3323) at the top of
 *           the dashboard home for a new business (≤ 30 days old), closed for
 *           good on «סגירה». No tour: NN/g found tours don't help (MEH-3200
 *           research, copy approved word for word by Sapir 14/11).
 * Does NOT: decide when it shows (hooks/useWhatsNew.js useOwnerWelcome).
 * History:  MEH-3200 (creation) · MEH-3720 (question line opens the support sheet).
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** @param {{ onClose: () => void, onSupport?: () => void, showCta?: boolean }} props */
// MEH-3079: showCta=false while the completeness card (same action) is on screen.
export default function OwnerWelcomeCard({ onClose, onSupport, showCta = true }) {
  const t = useTranslations("dashboard.producer.welcome_card");
  return (
    <section
      data-testid="owner-welcome"
      aria-labelledby="owner-welcome-heading"
      className="bg-surface border border-primary rounded-lg p-4 mb-6"
    >
      <h2 id="owner-welcome-heading" className="font-semibold text-text">
        {t("title")}
      </h2>
      <p className="text-sm text-text mt-2">{t("body")}</p>
      {/* MEH-3720: opens the one «צרו קשר» sheet (WhatsApp first) instead of
          a direct wa.me link — the same contact pattern as the rest of the dashboard. */}
      {onSupport ? (
        <button
          type="button"
          onClick={onSupport}
          data-testid="owner-welcome-whatsapp"
          className="inline-block text-sm text-fg-muted mt-2 underline decoration-[1.5px] underline-offset-[5px] decoration-current/35 hover:text-text text-start"
        >
          {t("whatsapp")}
        </button>
      ) : (
        <p className="text-sm text-fg-muted mt-2">{t("whatsapp")}</p>
      )}
      <div className="flex items-center gap-3 mt-3">
        {showCta && (
        <Link
          href="/producer/dashboard/edit"
          data-testid="owner-welcome-cta"
          className="min-h-touch inline-flex items-center rounded-full px-4 bg-primary text-background text-sm font-medium hover:bg-primary-dark transition"
        >
          {t("cta")}
        </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          data-testid="owner-welcome-close"
          className="min-h-touch inline-flex items-center px-2 rounded text-sm text-fg-muted hover:text-text focus-ring"
        >
          {t("close")}
        </button>
      </div>
    </section>
  );
}
