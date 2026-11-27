// @ts-check
"use client";
/**
 * Module:   OrderSheetDayConflict
 * Purpose:  In the order sheet, when the products picked share no day with
 *           an offered slot (MEH-3618): names the product that limits it,
 *           with its days, and offers to remove it from the order.
 * Does NOT: choose the product (lib/product-weekdays.js limitingProduct) or
 *           hold the picks (lib/use-order-cart.js).
 * Related:  components/public/OrderSheet.jsx (the host)
 * History:  MEH-3618 (creation) · MEH-3932 (also «צריך להזמין N ימים מראש»)
 */

import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { availabilityLine } from "@/lib/product-weekdays";

/** @param {{ product: any, onRemove: () => void }} props */
export default function OrderSheetDayConflict({ product, onRemove }) {
  const t = useTranslations("producer.detail.order_sheet");
  const tw = useTranslations("product_weekdays");
  const when = availabilityLine(product, tw) ?? "";
  return (
    <div className="space-y-2" data-testid="order-sheet-day-conflict">
      <InlineMessage tone="info">{t("day_conflict", { name: product.name, when })}</InlineMessage>
      <Button type="button" variant="outlined" size="sm" onClick={onRemove} data-testid="order-sheet-day-conflict-remove">
        {t("day_conflict_remove", { name: product.name })}
      </Button>
    </div>
  );
}
