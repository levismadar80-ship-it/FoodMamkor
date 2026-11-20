// @ts-check
"use client";

import { useTranslations } from "next-intl";
import EmailLinkUnsubscribe from "@/components/EmailLinkUnsubscribe";

/**
 * MEH-3079: stop the weekly owner summary email.
 * MEH-3464: the landing itself is components/EmailLinkUnsubscribe.jsx, shared
 * with the other email unsubscribe links.
 *
 * @param {{ token: string }} props
 */
export default function UnsubscribeClient({ token }) {
  const t = useTranslations("weekly_summary_unsubscribe");
  return (
    <EmailLinkUnsubscribe
      token={token}
      t={t}
      endpoint="/weekly-summary/unsubscribe"
      successCta={{ href: "/producer/dashboard/insights", labelKey: "cta_insights" }}
      retryTestid="weekly-unsubscribe-retry"
    />
  );
}
