/**
 * Directory-only disclaimer — required by Israeli consumer protection law.
 *
 * Shown on every producer detail page (home-product listing surfaces
 * deferred per MEH-543) so users understand the site is a directory only —
 * the seller bears legal responsibility for products and licensing.
 *
 * MEH-1548: layered disclosure. The surface carries ONE plain-language
 * sentence; the full legal weight stays on /terms behind the link below.
 * The previous wording led with "מדריך" — the legal positioning (an
 * editorial guide, not a marketplace) but not everyday Hebrew, and QA
 * (26/07) stopped at it: "מה זאת אומרת מדריך??". The substance is
 * unchanged: every clause is derived from existing /terms wording (§1
 * מהות השירות, §2 רישוי, §4 אחריות), so no new legal claim is made and
 * the declared verification scope is not widened. Copy locked by Sapir
 * (variant A) — do not reword without re-approval; it is legal copy.
 * Three keys collapsed to two (body + terms_link) because variant A
 * carries the price clause inline, retiring prices_set_by_businesses.
 */
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BRAND_NAME } from "@/lib/constants";

export default function DirectoryDisclaimer({ className = "" }) {
  const t = useTranslations("directory.disclaimer");
  return (
    <div
      className={`bg-green-50/60 border border-border rounded-[12px] p-3 text-xs text-text/80 leading-relaxed ${className}`}
      role="note"
    >
      <span className="font-semibold text-text">{BRAND_NAME}</span> {t("body")}{" "}
      <Link href="/terms" className="underline text-primary whitespace-nowrap">
        {t("terms_link")}
      </Link>
    </div>
  );
}
