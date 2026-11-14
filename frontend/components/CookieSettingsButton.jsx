// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { openCookieSettings } from "@/lib/cookie-consent";
import Button from "@/components/ui/Button";

/**
 * Module:   CookieSettingsButton
 * Purpose:  The «הגדרות עוגיות» control that reopens the cookie banner, so
 *           withdrawing consent is as easy as giving it (MEH-3196).
 * Does NOT: store or read consent — CookieBanner.jsx owns that and listens
 *           for COOKIE_SETTINGS_EVENT (lib/cookie-consent.js).
 * Related:  components/Footer.jsx (site footer copy), DashboardFooter.jsx,
 *           app/[locale]/privacy/page.js (cookies section).
 * History:  MEH-3196 (creation, after review: /map and the dashboards had
 *           no footer control).
 *
 * With `variant`, it renders the shared ui/Button (a page body); without, a
 * bare button styled by `className` to match the footer links beside it.
 *
 * @param {{ className?: string, testId?: string, variant?: string }} props
 */
export default function CookieSettingsButton({ className = "", testId = "cookie-settings-button", variant }) {
  const t = useTranslations();
  if (variant) {
    return (
      <Button variant={variant} onClick={openCookieSettings} data-testid={testId} className={className}>
        {t("nav.footer.cookie_settings")}
      </Button>
    );
  }
  return (
    <button type="button" onClick={openCookieSettings} data-testid={testId} className={className}>
      {t("nav.footer.cookie_settings")}
    </button>
  );
}
