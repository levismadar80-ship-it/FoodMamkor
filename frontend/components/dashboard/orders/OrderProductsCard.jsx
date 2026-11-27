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
 * Related:  lib/orderable-products.js, OrderSettingsCard.jsx (same fold)
 * History:  MEH-3216 gaps (creation) · MEH-3752 (an order-setup draft marks
 *           products to open; they wait, switched on, for «שמירה», which
 *           saves each through the same per-row route; a «?» on the first
 *           «פתוח להזמנה באתר»); daily stock (27/11: «כמה ביום» per product
 *           and per size or flavour, DailyLimitField.jsx)
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown } from "@phosphor-icons/react";

import FieldHelpLabel from "@/components/FieldHelpLabel";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import Switch from "@/components/ui/Switch";
import DailyLimitField from "@/components/dashboard/orders/DailyLimitField";
import { detailToMessage } from "@/lib/errors";
import { loadProductsOrdering, saveProductOrdering } from "@/lib/orderable-products";
import { draftProductIds } from "@/lib/order-setup-draft";

/** @param {{ id: string, label: string, checked: boolean, busy: boolean, onChange: (on: boolean) => void, help?: string }} props
 *   help: the field's «?» text (MEH-3752), shown on one row only. */
function SwitchLine({ id, label, checked, busy, onChange, help = undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      {help ? (
        <FieldHelpLabel labelId={id} label={label} help={help} testId="order-help-product_ids" />
      ) : (
        <span id={id} className="text-sm text-fg-muted">{label}</span>
      )}
      {/* aria-busy, not disabled: a disabled button drops keyboard focus on
          every tap. A tap while saving is ignored instead. */}
      <Switch checked={checked} aria-busy={busy} aria-labelledby={id} onClick={() => !busy && onChange(!checked)} data-testid={id} />
    </div>
  );
}

/**
 * @param {{ product: any, onSaved: (product: any) => void, help?: string, pending?: boolean, onPending?: (on: boolean) => void, error?: string | null }} props
 *   pending: a draft opens this product, not saved yet — the switch shows on
 *   and a tap takes it back, with no call. error: its draft save failed.
 */
function ProductRow({ product, onSaved, help = undefined, pending = false, onPending = undefined, error = null }) {
  const t = useTranslations("dashboard.producer.orders");
  const [state, setState] = useState(/** @type {{ busy?: boolean, error?: string|null }} */ ({}));
  const save = async (/** @type {{ is_orderable?: boolean, in_stock?: boolean, daily_limit?: number | null, variant_limits?: { id: string, daily_limit: number | null }[] }} */ change) => {
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
        checked={product.is_orderable || pending}
        busy={Boolean(state.busy)}
        onChange={(on) => (pending ? onPending?.(on) : save({ is_orderable: on }))}
        help={help}
      />
      <SwitchLine
        id={`sold-out-${key}`}
        label={t("products.sold_out")}
        checked={!product.in_stock}
        busy={Boolean(state.busy)}
        onChange={(soldOut) => save({ in_stock: !soldOut })}
      />
      <DailyLimits product={product} busy={Boolean(state.busy)} save={save} />
      {(state.error || error) && <InlineMessage tone="error">{state.error || error}</InlineMessage>}
    </li>
  );
}

/**
 * The unit beside «כמה ליום»: the price units' own words, «× 100 גרם» apart.
 * @param {string} priceUnit
 * @param {{ t: (key: string) => string, tUnits: (key: string) => string }} tr
 *   t: this card's translator; tUnits: producer.offer.units
 */
function unitLabel(priceUnit, { t, tUnits }) {
  if (priceUnit === "100g") return t("limit_unit_100g");
  return tUnits(priceUnit === "kg" ? "kg" : "units");
}

/**
 * Daily stock: «כמה ביום» for the product, and — with two sizes or flavours
 * or more — one more field for each of them on its own.
 * @param {{ product: any, busy: boolean, save: (change: any) => Promise<void> }} props
 */
function DailyLimits({ product, busy, save }) {
  const t = useTranslations("dashboard.producer.orders.products");
  const key = String(product.id);
  const variants = /** @type {any[]} */ (product.variants ?? []);
  const many = variants.length >= 2;
  const tUnits = useTranslations("producer.offer.units");
  const unit = unitLabel(product.price_unit, { t, tUnits });
  return (
    <div data-testid="daily-limits">
      <DailyLimitField
        id={`limit-${key}`}
        label={many ? t("limit_total") : t("limit")}
        value={product.daily_limit}
        unit={unit}
        busy={busy}
        onSave={(limit) => save({ daily_limit: limit })}
      />
      {many && (
        <>
          <p className="text-xs text-fg-muted pt-1">{t("limit_by_variant")}</p>
          {variants.map((v) => (
            <DailyLimitField
              key={v.id}
              id={`limit-${key}-${v.id}`}
              label={v.name}
              value={v.daily_limit}
              unit={unit}
              busy={busy}
              onSave={(limit) => save({ variant_limits: [{ id: v.id, daily_limit: limit }] })}
            />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * The products a draft opens (MEH-3752): the closed ones it names wait,
 * switched on, until `saveAll` saves each through the per-row route. One
 * that fails stays waiting with its Hebrew error.
 * @param {Record<string, unknown> | null} draft
 * @param {any[] | null} products
 * @param {(saved: any) => void} replace
 * @param {string} failedText
 */
function useDraftedProducts(draft, products, replace, failedText) {
  const [pending, setPending] = useState(/** @type {string[]} */ ([]));
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(/** @type {any} */ (null));
  // How many drafts brought products here: the card stays open after the
  // save (no snap shut under her hand) and opens again on the next draft.
  const [opens, setOpens] = useState(0);
  if (draft && products && draft !== applied) {
    setApplied(draft);
    const closed = new Set(products.filter((p) => !p.is_orderable).map((p) => String(p.id)));
    const next = draftProductIds(draft).filter((id) => closed.has(id));
    setPending(next);
    setErrors({});
    if (next.length) setOpens((n) => n + 1);
  }
  const drop = (/** @type {string} */ id) => setPending((old) => old.filter((x) => x !== id));
  const saveAll = async () => {
    setBusy(true);
    /** @type {Record<string, string>} */
    const failed = {};
    for (const id of pending) {
      try {
        // One at a time: the same route and checks as a tap on the switch.
        replace(await saveProductOrdering(products?.find((p) => String(p.id) === id), { is_orderable: true }));
      } catch (err) {
        failed[id] = detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || failedText;
      }
    }
    setErrors(failed);
    setPending(Object.keys(failed));
    setBusy(false);
  };
  return { pending, errors, busy, drop, saveAll, opens };
}

/**
 * @param {{ setUp?: boolean, initial?: any[] | null, onChange?: (products: any[]) => void, onError?: () => void, draft?: Record<string, unknown> | null }} props
 *   setUp: ordering is on with a window — the card then starts folded, but
 *   only once at least one product is open for ordering (otherwise this card
 *   is the next thing she has to do). `initial` skips the read (tests).
 */
export default function OrderProductsCard({ setUp = false, initial = null, onChange = undefined, onError = undefined, draft = null }) {
  const t = useTranslations("dashboard.producer.orders");
  const tHelp = useTranslations("dashboard.producer.orders.help");
  const [products, setProducts] = useState(/** @type {any[] | null} */ (initial));
  const [failed, setFailed] = useState(false);
  // Decided once, on the first list: flipping the first «פתוח להזמנה באתר»
  // must not snap the card shut under her hand.
  const [startFolded, setStartFolded] = useState(/** @type {boolean | null} */ (null));
  // Set while rendering (React's "adjust state on a prop change"), not in an
  // effect: it happens once, the first time the list is here.
  if (products && startFolded === null) setStartFolded(setUp && products.some((p) => p.is_orderable));
  useEffect(() => {
    if (initial) return undefined;
    let live = true;
    loadProductsOrdering()
      .then((rows) => live && setProducts(rows))
      .catch(() => {
        if (!live) return;
        setFailed(true);
        onError?.();
      });
    return () => {
      live = false;
    };
    // onError: the page passes a stable callback (useCallback).
  }, [initial, onError]);

  // MEH-3216: the page's «מה חסר» checklist counts the open products.
  useEffect(() => {
    if (products) onChange?.(products);
  }, [products, onChange]);
  const replace = (/** @type {any} */ saved) =>
    setProducts((old) => (old ?? []).map((p) => (p.id === saved.id ? saved : p)));
  const drafted = useDraftedProducts(draft, products, replace, t("actions.failed"));
  const details = useRef(/** @type {HTMLDetailsElement | null} */ (null));
  // A new draft reopens a card she folded since the last one.
  useEffect(() => {
    if (drafted.opens && details.current) details.current.open = true;
  }, [drafted.opens]);
  if (failed) return <InlineMessage tone="error">{t("load_error")}</InlineMessage>;
  if (!products || products.length === 0) return null;
  const folded = startFolded === null ? setUp && products.some((p) => p.is_orderable) : startFolded;
  return (
    <details ref={details} open={!folded || drafted.opens > 0} className="group rounded-lg border border-border bg-surface p-4 space-y-3" id="order-products" data-testid="order-products">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-touch focus-ring rounded-sm [&::-webkit-details-marker]:hidden">
        <h2 className="font-bold text-lg text-text">{t("products.title")}</h2>
        <CaretDown size={18} aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="divide-y divide-border">
        {products.map((product, index) => (
          <ProductRow
            key={product.id}
            product={product}
            onSaved={replace}
            help={index === 0 ? tHelp("product_ids") : undefined}
            pending={drafted.pending.includes(String(product.id))}
            onPending={(on) => !on && drafted.drop(String(product.id))}
            error={drafted.errors[String(product.id)] ?? null}
          />
        ))}
      </ul>
      {drafted.pending.length > 0 && (
        <Button size="sm" onClick={drafted.saveAll} loading={drafted.busy} data-testid="order-products-save">
          {t("settings.save")}
        </Button>
      )}
    </details>
  );
}
