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
 * History:  MEH-3216 stage 5b (creation; placement A, Sapir 14/11); daily
 *           stock (27/11: «+» stops at what is left, «נשארו N» at 3 or less,
 *           «אזל לימים הקרובים» when no offered day has any left)
 */

import { useEffect, useRef } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { LOW_STOCK_AT } from "@/lib/daily-stock";

const ROUND =
  "w-11 h-11 flex items-center justify-center rounded-full text-white focus-ring disabled:opacity-50";

/**
 * @param {{
 *   product: { id: string, name: string, in_stock: boolean, left?: number | null },
 *   qty: number,
 *   onChange: (id: string, qty: number) => void,
 * }} props
 */
export default function OrderStepper({ product, qty, onChange }) {
  const t = useTranslations("producer.detail.order_cart");
  const root = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const moved = useRef(false);
  // «הוספה» and the − n + group replace each other, so the button that was
  // pressed is gone. Put focus on its counterpart, or a keyboard or screen
  // reader user lands on <body> (fresh review of #4837).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const target =
      qty > 0 ? "[data-testid=order-plus]" : "[data-testid=order-add]";
    /** @type {HTMLElement | null | undefined} */ (
      root.current?.querySelector(target)
    )?.focus();
  }, [qty]);
  /** @param {number} next */
  const set = (next) => {
    moved.current = (qty === 0) !== (next === 0);
    onChange(product.id, next);
  };
  // Daily stock: the most she can pick on any offered day; null = no limit.
  const left = typeof product.left === "number" ? product.left : null;
  if (!product.in_stock || left === 0) {
    return (
      <span className="text-sm text-fg-muted" data-testid="order-sold-out">
        {left === 0 && product.in_stock ? t("sold_out_days") : t("sold_out")}
      </span>
    );
  }
  const low = left !== null && left <= LOW_STOCK_AT ? (
    <span className="text-xs text-fg-muted" data-testid="order-left">
      {t("left", { count: left })}
    </span>
  ) : null;
  if (qty === 0) {
    return (
      <span ref={root} className={low ? "flex flex-col items-center gap-0.5" : "contents"}>
        <Button
          variant="outlined"
          size="sm"
          data-testid="order-add"
          onClick={() => set(1)}
        >
          {t("add")}
          <span className="sr-only"> {product.name}</span>
        </Button>
        {low}
      </span>
    );
  }
  return (
    <span ref={root} className={low ? "flex flex-col items-center gap-0.5" : "contents"}>
      <div
        role="group"
        aria-label={product.name}
        className="flex items-center rounded-full bg-action-primary text-white"
        data-testid="order-stepper"
      >
        {/* «−» first: in RTL it lands on the right and «+» on the left, as in
          placement A (Sapir 14/11). */}
        <IconButton
          className={ROUND}
          label={t("remove_one", { name: product.name })}
          onClick={() => set(qty - 1)}
          data-testid="order-minus"
        >
          <Minus size={16} weight="bold" aria-hidden="true" />
        </IconButton>
        <span
          className="min-w-[1.5rem] text-center font-medium"
          aria-live="polite"
          data-testid="order-qty"
        >
          {qty}
        </span>
        <IconButton
          className={ROUND}
          label={t("add_one", { name: product.name })}
          onClick={() => set(qty + 1)}
          disabled={left !== null && qty >= left}
          data-testid="order-plus"
        >
          <Plus size={16} weight="bold" aria-hidden="true" />
        </IconButton>
      </div>
      {low}
    </span>
  );
}
