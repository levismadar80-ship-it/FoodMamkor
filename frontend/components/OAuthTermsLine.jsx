// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Module:   OAuthTermsLine
 * Purpose:  The one consent line under a Google / Apple button — "signing in
 *           with Google is agreeing to the terms and privacy policy" — and
 *           the «או» divider that follows it (MEH-3661: extracted so /register
 *           and the «רוצה לשמור?» modal render the same words, not a copy).
 * Does NOT: choose which string — the caller passes the auth.login key
 *           (lib/oauth-terms-key.js picks it from the configured providers).
 * Related:  app/[locale]/register/RegisterClient.jsx,
 *           components/LoginPromptGoogle.jsx.
 * History:  MEH-3661 (extracted from RegisterClient, MEH-2577).
 *
 * @param {{ termsKey: string, testId: string, className: string }} props
 */
export function OAuthTermsLine({ termsKey, testId, className }) {
  const t = useTranslations();
  return (
    <p data-testid={testId} className={className}>
      {t.rich(`auth.login.${termsKey}`, {
        tos: (chunks) => (
          <Link href="/terms" target="_blank" className="text-primary underline">
            {chunks}
          </Link>
        ),
        privacy: (chunks) => (
          <Link href="/privacy" target="_blank" className="text-primary underline">
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}

/**
 * The «או» rule between the OAuth buttons and the email way in.
 * @param {{ className: string, labelClassName: string }} props
 */
export function OrDivider({ className, labelClassName }) {
  const t = useTranslations();
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className={`px-3 text-fg-muted ${labelClassName}`}>{t("auth.register.consumer.oauth_divider")}</span>
      </div>
    </div>
  );
}
