// @ts-check
"use client";

import EmailLinkUnsubscribe from "@/components/EmailLinkUnsubscribe";

/**
 * MEH-1330: one-click newsletter unsubscribe landing.
 * MEH-3464: the landing itself is components/EmailLinkUnsubscribe.jsx, shared
 * with the other email unsubscribe links.
 *
 * @param {{ token: string }} props
 */
export default function UnsubscribeClient({ token }) {
  return (
    <EmailLinkUnsubscribe
      token={token}
      namespace="newsletter_unsubscribe"
      endpoint="/newsletter/unsubscribe"
    />
  );
}
