/**
 * Directory-only disclaimer — required by Israeli consumer protection law.
 *
 * Shown on every producer detail page (home-product listing surfaces
 * deferred per MEH-543) so users understand the site is a directory only —
 * the seller bears legal responsibility for products and licensing.
 */
"use client";

import { useTranslations } from "next-intl";
import { BRAND_NAME } from "@/lib/constants";

export default function DirectoryDisclaimer({ className = "" }) {
  const t = useTranslations("directory.disclaimer");
  return (
    <div
      className={`bg-green-50/60 border border-border rounded-[12px] p-3 text-xs text-site-text/80 leading-relaxed ${className}`}
      role="note"
    >
      <span className="font-semibold text-site-text">{BRAND_NAME}</span> {t("brand_is_prefix")}{" "}
      {t("directory_only")}{" "}
      {t("prices_set_by_businesses")}
    </div>
  );
}
