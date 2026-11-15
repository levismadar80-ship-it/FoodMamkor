// @ts-check
"use client";

/**
 * Module:   NewToolPill
 * Purpose:  The «חדש» pill on a «כלים» tile whose tool arrived in a release
 *           of the last 14 days (MEH-3200 part 2, copy approved 14/11). The
 *           list of new tools lives in lib/whats-new.js (`tools` on a release).
 * Does NOT: draw the tab dot (DashboardLayoutClient.jsx, same hook).
 * History:  MEH-3200 part 2 (creation).
 */

import { useTranslations } from "next-intl";
import Badge from "@/components/ui/Badge";
import { useNewTools } from "@/hooks/useWhatsNew";

/** @param {{ href: string }} props */
export default function NewToolPill({ href }) {
  const t = useTranslations("dashboard.producer.new_tool");
  const tools = useNewTools();
  if (!tools.has(href)) return null;
  return (
    <span data-testid="new-tool-pill" className="ms-2 align-middle inline-flex">
      <Badge variant="primary" size="sm" tooltip={null}>{t("pill")}</Badge>
    </span>
  );
}
