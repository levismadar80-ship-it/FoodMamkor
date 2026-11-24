// @ts-check
"use client";

/**
 * Module:   NewToolPill
 * Purpose:  The «חדש» pill on a «כלים» tile (or an «עריכה» hub tile, MEH-3723) whose tool arrived in a release
 *           of the last 14 days (MEH-3200 part 2, copy approved 14/11). The
 *           list of new tools lives in lib/whats-new.js (`tools` on a release).
 * Does NOT: draw the tab dot (DashboardLayoutClient.jsx, same hook).
 * History:  MEH-3200 part 2 (creation); MEH-3669 (`href` may be a list: a
 *           closed «כלים» group shows one pill when any of its tools is new).
 */

import { useTranslations } from "next-intl";
import Badge from "@/components/ui/Badge";
import { useNewTools } from "@/hooks/useWhatsNew";

/** @param {{ href: string | string[] }} props */
export default function NewToolPill({ href }) {
  const t = useTranslations("dashboard.producer.new_tool");
  const tools = useNewTools();
  if (![href].flat().some((h) => tools.has(h))) return null;
  return (
    <span data-testid="new-tool-pill" className="ms-2 align-middle inline-flex">
      <Badge variant="primary" size="sm" tooltip={null}>{t("pill")}</Badge>
    </span>
  );
}
