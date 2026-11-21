// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import InlineMessage from "@/components/ui/InlineMessage";
import UnverifiedEmailNotice from "@/components/UnverifiedEmailNotice";
import { UNVERIFIED_KEY } from "@/lib/useRescueReservation";

/**
 * Module:   RescueErrorLine
 * Purpose:  The one line under the reserve / cancel button that says why it
 *           did not work. Shared by the business page's bag block and the
 *           bag's own page (MEH-3586), so an error reads the same in both.
 * History:  MEH-3586 (moved out of RescueSection unchanged: MEH-3225 resend
 *           notice for an unverified email, MEH-3226 «כתבו לנו» link)
 *
 * @param {{ errorKey: string|null }} props
 */
export default function RescueErrorLine({ errorKey }) {
  const t = useTranslations("rescue");
  if (!errorKey) return null;
  if (errorKey === UNVERIFIED_KEY) {
    return <UnverifiedEmailNotice className="mt-3" text={t(UNVERIFIED_KEY)} />;
  }
  return (
    <InlineMessage className="font-body-sm" data-testid="rescue-section-error">
      {/* MEH-3226: «כתבו לנו» on the block message is a real link to /contact. */}
      {errorKey === "errors.blocked"
        ? t.rich(errorKey, {
            contact: (chunks) => (
              <Link href="/contact" className="underline" data-testid="rescue-blocked-contact">
                {chunks}
              </Link>
            ),
          })
        : t(errorKey)}
    </InlineMessage>
  );
}
