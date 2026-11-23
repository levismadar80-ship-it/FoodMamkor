// @ts-check
"use client";
/**
 * Module:   ProductVariantsBlock
 * Purpose:  In the product sheet, the product's sizes or flavours, each with
 *           its price. When the business takes orders on the site, each one
 *           has its own «הוספה», so a product with variants is added only
 *           with a choice (MEH-3617).
 * Does NOT: render for a product with fewer than two variants: one variant is
 *           applied without a choice (lib/product-variants.js::needsChoice).
 *           Does NOT hold the picks — ProducerDetail does (use-order-cart).
 * Related:  components/public/ProductSheet.jsx (the host),
 *           components/public/OrderStepper.jsx (the control per variant)
 * History:  MEH-3617 (creation)
 */

import { useTranslations } from "next-intl";

import OrderStepper from "@/components/public/OrderStepper";
import { lineKey, needsChoice, variantsOf } from "@/lib/product-variants";
import { formatPrice } from "@/lib/utils";
import { agorotToShekels } from "@/lib/money";


/**
 * @param {{
 *   product: { id: string, name: string, price_min?: number | string | null, variants?: { id: string, name: string, price_agorot?: number | null, in_stock: boolean }[] | null },
 *   orderable?: { id: string, in_stock: boolean, variants?: { id: string, name: string, price_agorot: number, in_stock: boolean }[] } | null,
 *   picks?: Record<string, number>,
 *   onChange?: (key: string, qty: number) => void,
 * }} props
 */
export default function ProductVariantsBlock({ product, orderable = null, picks = {}, onChange }) {
  const t = useTranslations("product_variants");
  const tCart = useTranslations("producer.detail.order_cart");
  if (!needsChoice(product)) return null;
  const menuVariants = new Map(variantsOf(orderable ?? {}).map((v) => [v.id, v]));
  return (
    <section aria-labelledby="product-variants-title" data-testid="product-variants">
      <h3 id="product-variants-title" className="text-sm font-medium text-text">
        {t("list_title")}
      </h3>
      {orderable && <p className="text-xs text-fg-muted mt-0.5">{t("pick_hint")}</p>}
      <ul className="mt-2 divide-y divide-border-subtle">
        {variantsOf(product).map((v) => {
          const menu = menuVariants.get(v.id);
          const price = formatPrice(menu ? agorotToShekels(menu.price_agorot) : priceOf(product, v));
          return (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2 min-h-[52px]" data-testid="product-variant-row">
              {/* A gap, not a margin: the price is dir="ltr", so its inline
                  start is the side away from the name. */}
              <span className={`flex items-baseline gap-2 ${v.in_stock ? "text-text" : "text-fg-muted"}`}>
                <span>{v.name}</span>
                {price && <span className="text-accent" dir="ltr">{price}</span>}
              </span>
              {orderable && menu && onChange ? (
                <OrderStepper
                  product={{ id: lineKey(product.id, v.id), name: `${product.name} · ${v.name}`, in_stock: menu.in_stock && orderable.in_stock }}
                  qty={picks[lineKey(product.id, v.id)] ?? 0}
                  onChange={onChange}
                />
              ) : (
                !v.in_stock && <span className="text-sm text-fg-muted" data-testid="product-variant-sold-out">{tCart("sold_out")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The variant's price in shekels on a page that takes no orders: its own, or
 * the product's.
 * @param {{ price_min?: number | string | null }} product
 * @param {{ price_agorot?: number | null }} variant
 * @returns {number | string | null}
 */
function priceOf(product, variant) {
  if (typeof variant.price_agorot === "number") return agorotToShekels(variant.price_agorot);
  return product.price_min ?? null;
}
