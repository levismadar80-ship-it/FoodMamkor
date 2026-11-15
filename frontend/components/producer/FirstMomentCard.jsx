// @ts-check
"use client";

/**
 * Module:   FirstMomentCard
 * Purpose:  A once-only «רגע ראשון» card at the top of the dashboard home —
 *           first review, first WhatsApp click, 100 views, first follower
 *           (MEH-3200 part 2; copy approved word for word by Sapir 14/11).
 * Does NOT: decide which moment is due (lib/first-moments.js) or where it
 *           ranks in the top slot (dashboard page.js: welcome → this → whats-new).
 * History:  MEH-3200 part 2 (creation).
 */

import { useTranslations } from "next-intl";
import { Eye, Star, UserPlus, WhatsappLogo } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";

/** @param {{ moment: import("@/lib/first-moments").Moment, onClose: () => void }} props */
export default function FirstMomentCard({ moment, onClose }) {
  const t = useTranslations("dashboard.producer.first_moments");
  // Looked up at render, not at import: test files that mock the icon set
  // without these names never render this card, and must not crash on import.
  const icons = { first_review: Star, first_whatsapp: WhatsappLogo, views_100: Eye, first_follower: UserPlus };
  const Icon = icons[/** @type {keyof typeof icons} */ (moment.key)] ?? Star;
  return (
    <section
      data-testid="first-moment"
      data-moment={moment.key}
      aria-labelledby="first-moment-heading"
      className="bg-surface border border-primary rounded-lg p-4 mb-6 flex items-start gap-3"
    >
      <span className="w-10 h-10 rounded-full bg-primary/10 inline-flex items-center justify-center text-primary shrink-0">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="first-moment-heading" className="font-semibold text-text">
          {t(`${moment.key}.title`)}
        </h2>
        <p className="text-sm text-fg-muted mt-1">{t(`${moment.key}.body`)}</p>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <Link
            href={moment.href}
            onClick={onClose}
            data-testid="first-moment-cta"
            className="min-h-touch inline-flex items-center rounded-full px-4 bg-primary text-background text-sm font-medium hover:bg-primary-dark transition focus-ring"
          >
            {t(`${moment.key}.cta`)}
          </Link>
          <button
            type="button"
            onClick={onClose}
            data-testid="first-moment-close"
            className="min-h-touch inline-flex items-center px-2 rounded text-sm text-fg-muted hover:text-text focus-ring"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </section>
  );
}
