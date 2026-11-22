// @ts-check
/**
 * Module:   NotAPartyLine
 * Purpose:  One line under a buy / reserve / sign-up button that names who the
 *           customer is dealing with, and says Mehamakor is not the seller.
 * Does NOT: show the seller's legal details — the order sheet does that
 *           (OrderSheet.jsx `seller_line`, MEH-3216). The full clause lives in
 *           the terms (`terms.sections.service`).
 * History:  MEH-3570 (creation, 21/11/2026) — the food-law check in MEH-3026
 *           rests on Mehamakor never being a party; this puts it where the
 *           customer commits, not only in the terms.
 */
"use client";

import { useTranslations } from "next-intl";

/** @param {{ name?: string | null, testId?: string, className?: string }} props */
export default function NotAPartyLine({ name, testId = "not-a-party-line", className = "" }) {
  const t = useTranslations("directory.not_a_party");
  const trimmed = (name || "").trim();
  return (
    <p className={`text-xs text-fg-muted text-center ${className}`} data-testid={testId}>
      {trimmed ? t("named", { name: trimmed }) : t("unnamed")}
    </p>
  );
}
