// @ts-check
"use client";
/**
 * Module:   ProductVariantsField
 * Purpose:  The «אפשרויות» block of the owner's product editor: sizes or
 *           flavours of one product, each with a name, an optional price, an
 *           «במלאי» switch and its place in the list. Saved on its own button,
 *           as the whole list, to PUT /products/{id}/variants.
 * Touches:  PUT /products/{product_id}/variants (owner or admin, 60/hour).
 * Does NOT: save the rest of the product — the product form's own «שמירה»
 *           does. Does NOT render on the add form: a product needs an id
 *           first, so the options are added once it is saved.
 * Related:  backend/app/routers/product_variants.py, lib/product-variants.js,
 *           components/ProductsSection.jsx (the host)
 * History:  MEH-3617 (creation)
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

// Mirrors MAX_VARIANTS_PER_PRODUCT (backend/app/limits.py); the server holds it.
export const MAX_VARIANTS = 10;
const AGOROT = 100;
const ICON_BTN = "w-11 h-11 flex items-center justify-center rounded-full text-fg-muted hover:bg-primary/[0.06] focus-ring disabled:opacity-50";

/** @typedef {{ key: string, id: string | null, name: string, price: string, in_stock: boolean }} Row */

/** @param {{ id: string, name: string, price_agorot?: number | null, in_stock: boolean }[]} variants @returns {Row[]} */
export function rowsFrom(variants) {
  return (variants || []).map((v) => ({
    key: v.id,
    id: v.id,
    name: v.name,
    price: typeof v.price_agorot !== "number" ? "" : String(v.price_agorot / AGOROT),
    in_stock: v.in_stock,
  }));
}

/** The request body: blank rows dropped, a price in agorot or null. @param {Row[]} rows */
export function bodyFrom(rows) {
  return {
    variants: rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        name: r.name.trim(),
        price_agorot: r.price.trim() === "" ? null : Math.round(Number(r.price) * AGOROT),
        in_stock: r.in_stock,
      })),
  };
}

/**
 * @param {{
 *   productId: string,
 *   variants?: { id: string, name: string, price_agorot?: number | null, in_stock: boolean }[],
 *   onSaved: (variants: any[]) => void,
 * }} props
 */
export default function ProductVariantsField({ productId, variants = [], onSaved }) {
  const t = useTranslations("product_variants");
  const [rows, setRows] = useState(() => rowsFrom(variants));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** @param {number} i @param {Partial<Row>} change */
  const edit = (i, change) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...change } : r)));
  /** @param {number} i @param {number} by */
  const move = (i, by) => setRows((rs) => {
    const next = [...rs];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });
  const add = () => setRows((rs) => [...rs, { key: `new-${Date.now()}-${rs.length}`, id: null, name: "", price: "", in_stock: true }]);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put(`/products/${productId}/variants`, bodyFrom(rows));
      setRows(rowsFrom(data.variants));
      onSaved(data.variants);
      showToast.success(t("saved"));
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("save_failed"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <fieldset className="space-y-2" data-testid="product-variants-field">
      <legend className="text-sm font-medium text-text">{t("editor_title")}</legend>
      <p className="text-xs text-fg-muted">{t("editor_where")}</p>
      <p className="text-xs text-fg-muted">{t("editor_hint")}</p>
      {rows.map((row, i) => (
        <VariantRow key={row.key} row={row} index={i} last={i === rows.length - 1} edit={edit} move={move}
          remove={() => setRows((rs) => rs.filter((_, n) => n !== i))} t={t} />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {rows.length < MAX_VARIANTS ? (
          <Button type="button" variant="outlined" size="sm" onClick={add} data-testid="product-variant-add">{t("add")}</Button>
        ) : (
          <p className="text-xs text-fg-muted" data-testid="product-variant-cap">{t("cap", { max: MAX_VARIANTS })}</p>
        )}
        <Button type="button" size="sm" onClick={save} disabled={saving} data-testid="product-variant-save">{t("save")}</Button>
      </div>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </fieldset>
  );
}

/** @param {{ row: Row, index: number, last: boolean, edit: (i: number, c: Partial<Row>) => void, move: (i: number, by: number) => void, remove: () => void, t: any }} props */
function VariantRow({ row, index, last, edit, move, remove, t }) {
  const label = row.name || String(index + 1);
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border-subtle pb-2" data-testid="product-variant-edit-row">
      <div className="flex-1 min-w-[8rem]">
        <Input size="sm" label={t("name_label")} value={row.name} maxLength={40} placeholder={t("name_placeholder")}
          onChange={(e) => edit(index, { name: e.target.value })} />
      </div>
      <div className="w-28">
        <Input size="sm" label={t("price_label")} value={row.price} inputMode="decimal" dir="ltr" placeholder={t("price_placeholder")}
          onChange={(e) => edit(index, { price: e.target.value })} />
      </div>
      <label className="flex items-center gap-1.5 min-h-touch text-sm text-text">
        <input type="checkbox" checked={row.in_stock} onChange={(e) => edit(index, { in_stock: e.target.checked })} />
        {t("in_stock")}
      </label>
      <button type="button" className={ICON_BTN} disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("move_up", { name: label })}>
        <ArrowUp size={18} aria-hidden="true" />
      </button>
      <button type="button" className={ICON_BTN} disabled={last} onClick={() => move(index, 1)} aria-label={t("move_down", { name: label })}>
        <ArrowDown size={18} aria-hidden="true" />
      </button>
      <button type="button" className={ICON_BTN} onClick={remove} aria-label={t("remove", { name: label })}>
        <Trash size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
