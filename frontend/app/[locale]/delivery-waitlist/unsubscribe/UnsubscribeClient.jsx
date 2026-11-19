// @ts-check
"use client";

import { useTranslations } from "next-intl";
import EmailLinkUnsubscribe from "@/components/EmailLinkUnsubscribe";

/**
 * MEH-2618: one-click removal from a business's delivery waitlist.
 * MEH-3464: the landing itself is components/EmailLinkUnsubscribe.jsx, shared
 * with the other email unsubscribe links.
 *
 * @param {{ token: string }} props
 */
export default function UnsubscribeClient({ token }) {
  const t = useTranslations("delivery_waitlist_unsubscribe");
  return (
    <EmailLinkUnsubscribe
      token={token}
      t={t}
      endpoint="/delivery-waitlist/unsubscribe"
    />
  );
}
