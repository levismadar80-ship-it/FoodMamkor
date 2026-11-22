// @ts-check
"use client";

/**
 * MEH-3592: under the quantity field — what is left (a units cap) and what the
 * order comes to («3 ק"ג × 13₪ = 39₪»). Wolt and Too Good To Go show the line
 * total before the button; a bare quantity left the sum to mental math.
 */
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";

/** @param {{ gb: any, quantity: number | string }} props */
export default function GroupBuyLineTotal({ gb, quantity }) {
  const t = useTranslations("group_buys.detail");
  const qty = Math.max(1, Math.floor(Number(quantity)) || 1);
  const price = Number(gb.price_per_unit_group);
  const hasPrice = Number.isFinite(price) && price > 0;
  const hasLeft = typeof gb.units_left === "number";
  if (!hasPrice && !hasLeft) return null;
  return (
    <div className="space-y-1 text-sm">
      {hasLeft && (
        <p className="text-fg-muted" data-testid="group-buy-units-left">
          {t("units_left", { count: gb.units_left, unit: gb.unit || t("unit_fallback") })}
        </p>
      )}
      {hasPrice && (
        <p className="font-medium text-text" data-testid="group-buy-line-total">
          {t("line_total", {
            qty,
            unit: gb.unit || t("unit_fallback"),
            price: formatPrice(price),
            total: formatPrice(Math.round(qty * price * 100) / 100),
          })}
        </p>
      )}
    </div>
  );
}
