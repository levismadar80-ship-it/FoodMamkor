// @ts-check
"use client";

/**
 * Module:   HubAlertHint
 * Purpose:  MEH-3117 — the way out of an empty hub tab (/rescue, /group-buys):
 *           one line saying how to hear about the next one (save a business,
 *           turn on its alert) and a button to the business list. Too Good To
 *           Go's empty state does the same (favourite → get notified).
 * Does NOT: decide WHEN to show — the caller renders it in its 0-items state
 *           only. It does not save anything or open the alert panel; the
 *           toggle lives on the business page (AlertPrefsPanel).
 * Related:  components/rescue/RescueList.jsx, app/[locale]/group-buys/GroupBuysClient.jsx,
 *           components/AlertPrefsPanel.jsx (the toggles this line points at)
 * History:  MEH-3117 (creation; copy approved by Sapir 14/11, rows 4–6)
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * @param {{ kind: "rescue" | "group_buys", align?: "center" | "start", className?: string }} props
 */
export default function HubAlertHint({ kind, align = "center", className = "" }) {
  const t = useTranslations("hub_alert_hint");
  // One alignment class per value — never two competing `items-*` on one node.
  const alignClass = align === "start" ? "items-start text-start" : "items-center text-center";
  return (
    <div data-testid={`hub-alert-hint-${kind}`} className={`flex flex-col gap-3 ${alignClass} ${className}`}>
      <p className="font-body-sm text-sm text-fg-muted max-w-sm">{t(kind)}</p>
      <Link
        href="/producers"
        className="inline-flex items-center justify-center min-h-touch px-6 rounded-full border border-primary text-primary text-sm font-medium hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
