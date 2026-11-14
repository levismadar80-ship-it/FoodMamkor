// @ts-check
"use client";

/**
 * Module:   WhatsNewRow
 * Purpose:  The fixed «מה חדש במהמקור» row above «צריכים עזרה?» on the
 *           dashboard home — the permanent way into the release archive, with
 *           a dot while the newest release is unseen (MEH-3200, placement ג׳).
 * Does NOT: show release text (WhatsNewCard.jsx) or mark anything seen — the
 *           archive page does that when it opens.
 * History:  MEH-3200 (creation).
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useUnseenRelease } from "@/hooks/useWhatsNew";
import { visibleReleases } from "@/lib/whats-new";
import { WHATS_NEW_HREF } from "./WhatsNewCard";

export default function WhatsNewRow() {
  const t = useTranslations("dashboard.producer.whats_new");
  const { release } = useUnseenRelease();
  // Zero releases with anything to show → nothing to read, no row.
  if (visibleReleases().length === 0) return null;
  return (
    <div
      data-testid="whats-new-row"
      className="bg-surface border border-border rounded-lg p-4 mb-6 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p id="whats-new-row-title" className="font-semibold text-text text-sm flex items-center gap-2">
          {t("row_title")}
          {release && (
            <span data-testid="whats-new-dot" className="w-2 h-2 rounded-full bg-primary inline-block shrink-0">
              <span className="sr-only">{" "}{t("row_unread")}</span>
            </span>
          )}
        </p>
        <p className="text-sm text-fg-muted">{t("row_body")}</p>
      </div>
      <Link
        href={WHATS_NEW_HREF}
        data-testid="whats-new-row-cta"
        aria-describedby="whats-new-row-title"
        className="min-h-touch inline-flex items-center text-sm text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current shrink-0"
      >
        {t("row_cta")}
      </Link>
    </div>
  );
}
