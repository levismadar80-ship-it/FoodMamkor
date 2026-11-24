// @ts-check
"use client";

/**
 * Module:   GoogleProfileHubTile
 * Purpose:  The «הפרופיל בגוגל» tile in the edit tab's hub, after «קשר»
 *           (MEH-3723, Sapir's pick 22/11). The tool checks that Google shows
 *           the same name, address and hours as the page, so it sits with the
 *           business details, not with recipes under «כלים».
 * Does NOT: decide who sees it — edit/page.js renders it for a business only
 *           (the server 404s an organizer).
 * History:  MEH-3641 (tile on the tools tab); MEH-3723 (moved here).
 */

import { useTranslations } from "next-intl";
import EditHubCard from "@/components/EditHubCard";
import NewToolPill from "@/components/producer/NewToolPill";

export default function GoogleProfileHubTile() {
  const t = useTranslations("dashboard.producer.quick_links.google_profile");
  return (
    <EditHubCard
      testId="hub-card-google-profile"
      href="/producer/dashboard/google-profile"
      title={t("title")}
      marker={<NewToolPill href="/producer/dashboard/google-profile" />}
      statusLine={t("sub")}
    />
  );
}
