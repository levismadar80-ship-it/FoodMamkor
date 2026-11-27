// @ts-check
"use client";

/**
 * Module:   CommunityRow
 * Purpose:  The fixed «קבוצת העדכונים לבתי עסק» row on the dashboard home,
 *           right above «מה חדש במהמקור»: a permanent way into the WhatsApp
 *           community for an approved business (Sapir 27/11, placement א׳).
 * Does NOT: know the invite link or who may see it — GET
 *           /producers/me/dashboard sends `community_invite_url` only to an
 *           approved, non-organizer business, and only when the server has
 *           the link (producer_me.py _community_invite_url). No link → no row.
 * Related:  WhatsNewRow.jsx (the row it sits above, same shape);
 *           backend/app/services/admin_producer_emails.py (the approval
 *           email, until now the link's only door, MEH-2134).
 */

import { useTranslations } from "next-intl";
import { WhatsappLogo } from "@phosphor-icons/react";
import Link from "@/components/ui/Link";

// UI scale 16 = inline with body text (DESIGN.md Icons), as WhatsNewRow.
const ROW_ICON_PX = 16;

/** @param {{ inviteUrl?: string | null }} props */
export default function CommunityRow({ inviteUrl }) {
  const t = useTranslations("dashboard.producer.community_row");
  if (!inviteUrl) return null;
  return (
    <div
      data-testid="community-row"
      className="bg-surface border border-border rounded-lg p-4 mb-6 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p id="community-row-title" className="font-semibold text-text text-sm flex items-center gap-2">
          <WhatsappLogo size={ROW_ICON_PX} weight="fill" className="shrink-0 text-whatsapp" aria-hidden="true" />
          {t("title")}
        </p>
        <p className="text-sm text-fg-muted">{t("body")}</p>
      </div>
      <Link
        href={inviteUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="community-row-cta"
        aria-describedby="community-row-title"
        className="min-h-touch inline-flex items-center text-sm font-medium shrink-0"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
