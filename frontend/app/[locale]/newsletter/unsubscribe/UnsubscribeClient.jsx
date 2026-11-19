// @ts-check
"use client";

import { useTranslations } from "next-intl";
import EmailLinkUnsubscribe from "@/components/EmailLinkUnsubscribe";

/**
 * MEH-1330: one-click newsletter unsubscribe landing.
 * MEH-3464: the landing itself is components/EmailLinkUnsubscribe.jsx, shared
 * with the other email unsubscribe links.
 *
 * @param {{ token: string }} props
 */
export default function UnsubscribeClient({ token }) {
  const t = useTranslations("newsletter_unsubscribe");
  return (
    <EmailLinkUnsubscribe
      token={token}
      t={t}
      endpoint="/newsletter/unsubscribe"
    />
  );
}
