// @ts-check
"use client";
/**
 * Module:   RowOrderControl
 * Purpose:  What sits at the inline end of a product row on a business page
 *           that takes orders: the «הוספה» stepper, or — for a product with
 *           two or more sizes or flavours — «בחירה», which opens the product
 *           sheet where each variant has its own «הוספה» (MEH-3617).
 * Does NOT: hold state — ProducerDetail owns the picks (lib/use-order-cart.js).
 * Related:  components/public/OrderStepper.jsx, components/public/
 *           ProductVariantsBlock.jsx, lib/product-variants.js
 * History:  MEH-3617 (creation)
 */

import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import OrderStepper from "@/components/public/OrderStepper";
import { lineKey, needsChoice, variantsOf } from "@/lib/product-variants";

/**
 * @param {{
 *   orderable: { id: string, name: string, in_stock: boolean, variants?: { id: string, in_stock: boolean }[] },
 *   picks: Record<string, number>,
 *   onChange: (key: string, qty: number) => void,
 *   onChoose: () => void,
 * }} props
 */
export default function RowOrderControl({ orderable, picks, onChange, onChoose }) {
  const t = useTranslations("product_variants");
  const tCart = useTranslations("producer.detail.order_cart");
  const variants = variantsOf(orderable);
  if (!needsChoice(orderable)) {
    // 0 variants: the product itself. 1 variant: that variant, with no choice.
    const only = variants[0];
    const key = lineKey(orderable.id, only?.id);
    const inStock = orderable.in_stock && (only ? only.in_stock : true);
    // Daily stock: the variant's `left` already counts the product's limit.
    const left = /** @type {any} */ (only ?? orderable).left ?? null;
    return (
      <OrderStepper
        product={{ id: key, name: orderable.name, in_stock: inStock, left }}
        qty={picks[key] ?? 0}
        onChange={onChange}
      />
    );
  }
  if (!orderable.in_stock) {
    return (
      <span className="text-sm text-fg-muted" data-testid="order-sold-out">
        {tCart("sold_out")}
      </span>
    );
  }
  const chosen = variants.reduce((sum, v) => sum + (picks[lineKey(orderable.id, v.id)] ?? 0), 0);
  return (
    <span className="flex flex-col items-center gap-0.5">
      <Button variant="outlined" size="sm" data-testid="order-choose" onClick={onChoose}>
        {t("choose")}
        <span className="sr-only"> {orderable.name}</span>
      </Button>
      {chosen > 0 && (
        <span className="text-xs text-fg-muted" data-testid="order-chosen">
          {t("chosen", { count: chosen })}
        </span>
      )}
    </span>
  );
}
