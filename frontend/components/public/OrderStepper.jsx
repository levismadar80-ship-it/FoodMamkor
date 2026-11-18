// @ts-check
"use client";
/**
 * Module:   OrderStepper
 * Purpose:  The «הוספה» control at the inline end of one product row on a
 *           business page that takes orders: «הוספה» at zero, − n + after,
 *           «אזל להיום» when the business marked it sold out.
 * Does NOT: hold state — ProducerDetail owns the picks (lib/use-order-cart.js)
 *           and passes the quantity in. It is a sibling of the row's button,
 *           never inside it: a button inside a button is not reachable.
 * Related:  app/[locale]/producer/[id]/components/ProducerSections.jsx (the
 *           row), components/public/OrderBar.jsx (the sum)
 * History:  MEH-3216 stage 5b (creation; placement A, Sapir 14/11)
 */

import { Minus, Plus } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";

const ROUND = "w-11 h-11 flex items-center justify-center rounded-full text-white focus-ring";

/**
 * @param {{
 *   product: { id: string, name: string, in_stock: boolean },
 *   qty: number,
 *   onChange: (id: string, qty: number) => void,
 * }} props
 */
export default function OrderStepper({ product, qty, onChange }) {
  const t = useTranslations("producer.detail.order_cart");
  if (!product.in_stock) {
    return (
      <span className="text-sm text-fg-muted" data-testid="order-sold-out">
        {t("sold_out")}
      </span>
    );
  }
  if (qty === 0) {
    return (
      <Button variant="outlined" size="sm" data-testid="order-add" onClick={() => onChange(product.id, 1)}>
        {t("add")}
        <span className="sr-only"> {product.name}</span>
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label={product.name}
      className="flex items-center rounded-full bg-action-primary text-white"
      data-testid="order-stepper"
    >
      <button
        type="button"
        className={ROUND}
        aria-label={t("add_one", { name: product.name })}
        onClick={() => onChange(product.id, qty + 1)}
        data-testid="order-plus"
      >
        <Plus size={16} weight="bold" aria-hidden="true" />
      </button>
      <span className="min-w-[1.5rem] text-center font-medium" aria-live="polite" data-testid="order-qty">
        {qty}
      </span>
      <button
        type="button"
        className={ROUND}
        aria-label={t("remove_one", { name: product.name })}
        onClick={() => onChange(product.id, qty - 1)}
        data-testid="order-minus"
      >
        <Minus size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
