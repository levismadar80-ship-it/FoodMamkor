// @ts-check
"use client";

/**
 * Module:   OrderProductsCard
 * Purpose:  The business's products with the two switches on-site ordering
 *           needs every day: «פתוח להזמנה באתר» and «אזל כרגע».
 * Touches:  GET /producers/me/products/ordering · PUT
 *           /producers/me/products/{id}/ordering (one row per tap).
 * Does NOT: edit a product (name, price, photo) — that stays in «עריכה»
 *           (ProductsSection.jsx). A product with no price cannot be opened
 *           for ordering; the server says so in Hebrew and the row shows it.
 *           Renders NOTHING for a business with no products (0 items).
 * Related:  lib/product-ordering.js, OrderSettingsCard.jsx (same fold)
 * History:  MEH-3216 gaps (creation)
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown } from "@phosphor-icons/react";

import InlineMessage from "@/components/ui/InlineMessage";
import Switch from "@/components/ui/Switch";
import { detailToMessage } from "@/lib/errors";
import { loadProductsOrdering, saveProductOrdering } from "@/lib/product-ordering";

/** @param {{ id: string, label: string, checked: boolean, busy: boolean, onChange: (on: boolean) => void }} props */
function SwitchLine({ id, label, checked, busy, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span id={id} className="text-sm text-fg-muted">{label}</span>
      {/* aria-busy, not disabled: a disabled button drops keyboard focus on
          every tap. A tap while saving is ignored instead. */}
      <Switch checked={checked} aria-busy={busy} aria-labelledby={id} onClick={() => !busy && onChange(!checked)} data-testid={id} />
    </div>
  );
}

/** @param {{ product: any, onSaved: (product: any) => void }} props */
function ProductRow({ product, onSaved }) {
  const t = useTranslations("dashboard.producer.orders");
  const [state, setState] = useState(/** @type {{ busy?: boolean, error?: string|null }} */ ({}));
  const save = async (/** @type {{ is_orderable?: boolean, in_stock?: boolean }} */ change) => {
    setState({ busy: true });
    try {
      onSaved(await saveProductOrdering(product, change));
      setState({});
    } catch (err) {
      setState({ error: detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("actions.failed") });
    }
  };
  const key = String(product.id);
  return (
    <li className="py-2 space-y-1" data-testid="order-product">
      <p className="font-medium text-text">{product.name}</p>
      <SwitchLine
        id={`orderable-${key}`}
        label={t("products.orderable")}
        checked={product.is_orderable}
        busy={Boolean(state.busy)}
        onChange={(on) => save({ is_orderable: on })}
      />
      <SwitchLine
        id={`sold-out-${key}`}
        label={t("products.sold_out")}
        checked={!product.in_stock}
        busy={Boolean(state.busy)}
        onChange={(soldOut) => save({ in_stock: !soldOut })}
      />
      {state.error && <InlineMessage tone="error">{state.error}</InlineMessage>}
    </li>
  );
}

/**
 * @param {{ setUp?: boolean, initial?: any[] | null }} props
 *   setUp: ordering is on with a window — the card then starts folded, but
 *   only once at least one product is open for ordering (otherwise this card
 *   is the next thing she has to do). `initial` skips the read (tests).
 */
export default function OrderProductsCard({ setUp = false, initial = null }) {
  const t = useTranslations("dashboard.producer.orders");
  const [products, setProducts] = useState(/** @type {any[] | null} */ (initial));
  const [failed, setFailed] = useState(false);
  // Decided once, on the first list: flipping the first «פתוח להזמנה באתר»
  // must not snap the card shut under her hand.
  const [startFolded, setStartFolded] = useState(/** @type {boolean | null} */ (null));
  useEffect(() => {
    if (products && startFolded === null) setStartFolded(setUp && products.some((p) => p.is_orderable));
  }, [products, setUp, startFolded]);
  useEffect(() => {
    if (initial) return undefined;
    let live = true;
    loadProductsOrdering()
      .then((rows) => live && setProducts(rows))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [initial]);

  if (failed) return <InlineMessage tone="error">{t("load_error")}</InlineMessage>;
  if (!products || products.length === 0) return null;
  const replace = (/** @type {any} */ saved) =>
    setProducts((old) => (old ?? []).map((p) => (p.id === saved.id ? saved : p)));
  return (
    <details open={startFolded === null ? !(setUp && products.some((p) => p.is_orderable)) : !startFolded} className="group rounded-lg border border-border bg-surface p-4 space-y-3" data-testid="order-products">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-touch focus-ring rounded-sm [&::-webkit-details-marker]:hidden">
        <h2 className="font-bold text-lg text-text">{t("products.title")}</h2>
        <CaretDown size={18} aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="divide-y divide-border">
        {products.map((product) => (
          <ProductRow key={product.id} product={product} onSaved={replace} />
        ))}
      </ul>
    </details>
  );
}
