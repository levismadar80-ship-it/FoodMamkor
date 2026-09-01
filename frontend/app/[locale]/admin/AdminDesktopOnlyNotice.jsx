"use client";

import { Desktop } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

/**
 * Module:   AdminDesktopOnlyNotice
 * Purpose:  MEH-2070 (A-narrow) — tells an admin on a phone that the screen
 *           they opened is built for a desktop, without taking it away.
 * Touches:  next-intl (one key, admin namespace).
 * Does NOT: block, redirect, or hide the content underneath. It is a banner
 *           ABOVE the existing screen, and that is the whole decision: the
 *           approvals queue is the surface that had to work on a phone
 *           (manual approval is a LOCK), and the rest of /admin stays
 *           reachable rather than becoming a dead end. A blocker here would
 *           re-create the gap this ticket closed, one layer down.
 *
 * `md:hidden` — desktop never sees it, so this costs the primary surface
 * nothing. Neutral admin-namespace wording (backoffice; ADR-014's gendered
 * -copy constraint governs consumer surfaces, not this one).
 */
export default function AdminDesktopOnlyNotice() {
  const t = useTranslations("admin.layout");
  return (
    <div
      data-testid="admin-desktop-only-notice"
      className="md:hidden mb-4 flex items-center gap-2 rounded-[8px] border border-border bg-cream-100 px-3 py-2 text-sm text-ink-700"
    >
      <Desktop size={18} weight="regular" aria-hidden="true" className="shrink-0" />
      <span>{t("desktop_only")}</span>
    </div>
  );
}
