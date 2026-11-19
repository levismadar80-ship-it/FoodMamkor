// @ts-check
"use client";

import EmailLinkUnsubscribe from "@/components/EmailLinkUnsubscribe";

/**
 * MEH-3079: stop the weekly owner summary email.
 * MEH-3464: the landing itself is components/EmailLinkUnsubscribe.jsx, shared
 * with the other email unsubscribe links.
 *
 * @param {{ token: string }} props
 */
export default function UnsubscribeClient({ token }) {
  return (
    <EmailLinkUnsubscribe
      token={token}
      namespace="weekly_summary_unsubscribe"
      endpoint="/weekly-summary/unsubscribe"
      successCta={{ href: "/producer/dashboard/insights", labelKey: "cta_insights" }}
      retryTestid="weekly-unsubscribe-retry"
    />
  );
}
