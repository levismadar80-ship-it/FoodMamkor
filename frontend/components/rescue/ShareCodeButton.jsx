// @ts-check
"use client";

/**
 * Module:   ShareCodeButton
 * Purpose:  «לשלוח לחבר שיאסוף» on a reserved bag (MEH-3704): the pickup code,
 *           the business, the day and window, the address and what to say at
 *           the counter, through the phone's share sheet, else WhatsApp.
 * Does NOT: move the reservation to another person. The code belongs to the
 *           order, not to a user, so whoever says it collects the bag; the
 *           server needs no change (card scope: no friend accounts).
 * Related:  components/rescue/RescueConfirmation.jsx (renders it);
 *           lib/share-link.js `tryNativeShare`; lib/utils.js `getWhatsAppHref`
 * History:  MEH-3704 (creation)
 */

import { useTranslations } from "next-intl";
import { ShareNetwork } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import { tryNativeShare } from "@/lib/share-link";
import { getWhatsAppHref } from "@/lib/utils";

/**
 * The message, one fact per line; a line with nothing to say is left out.
 * @param {{ code: string, business?: string | null, when?: string | null, address?: string | null, price?: string | null }} parts
 * @param {(key: string, values?: Record<string, string>) => string} t  the `rescue` namespace
 */
export function shareCodeText({ code, business, when, address, price }, t) {
  return [
    business ? t("share.line_code_at", { business, code }) : t("share.line_code", { code }),
    when,
    address,
    price ? t("share.line_say_pay", { price }) : t("share.line_say"),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {{ text: string }} props
 */
export default function ShareCodeButton({ text }) {
  const t = useTranslations("rescue");
  const onClick = async () => {
    // The sheet where the phone has one; elsewhere WhatsApp with the text
    // ready, which is where a friend is usually asked in Israel.
    // A refused sheet ("unavailable") falls back too; a cancel is an answer.
    if ((await tryNativeShare({ text })) !== "unavailable") return;
    window.open(getWhatsAppHref("", text), "_blank", "noopener,noreferrer");
  };
  return (
    <Button
      variant="outlined"
      size="sm"
      onClick={onClick}
      leadingIcon={<ShareNetwork aria-hidden="true" />}
      data-testid="rescue-share-code"
    >
      {t("share.button")}
    </Button>
  );
}
