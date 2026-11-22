// @ts-check
"use client";
/**
 * Module:   ProductWeekdaysLine
 * Purpose:  «זמין בימי שישי» / «זמין בימים ה׳–ו׳» under a product's name, on
 *           the business page row and in the product sheet (MEH-3618).
 *           Nothing for a product made every day.
 * Does NOT: stop adding to the cart — the order sheet offers only matching
 *           days (lib/product-weekdays.js).
 * History:  MEH-3618 (creation)
 */

import { useTranslations } from "next-intl";

import { weekdaysLine } from "@/lib/product-weekdays";

/** @param {{ product: any, className?: string }} props */
export default function ProductWeekdaysLine({ product, className = "text-xs text-fg-muted mt-0.5" }) {
  const t = useTranslations("product_weekdays");
  const line = weekdaysLine(product?.available_weekdays, t);
  if (!line) return null;
  return <p className={className} data-testid="product-weekdays-line">{line}</p>;
}
