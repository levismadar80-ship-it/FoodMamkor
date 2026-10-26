"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { DraftProductSchema } from "@/lib/api-schemas";
import { formatPriceRange } from "@/lib/utils";
import Input from "@/components/ui/Input";

/**
 * Module:   DraftProductsPanel
 * Purpose:  On an ownerless DRAFT's edit page, let the admin build the
 *           catalogue the owner will receive with the claim link: list, add
 *           (name, description, price) and delete (MEH-2321 chunk D).
 * Touches:  POST /admin/producers/{id}/products ·
 *           DELETE /admin/producers/{id}/products/{product_id}
 *           (producer_claim.py). Both answer 409 once the draft is claimed;
 *           that detail is shown verbatim.
 * Does NOT: set diet flags (the owner declares those herself after the claim —
 *           the server drops them too), upload images, or edit a product
 *           (delete + re-add; the owner edits from her dashboard once it's hers).
 * Related:  components/ProductsSection.jsx (the owner's editor — same field
 *           labels and validation messages, reused from settings.products),
 *           app/[locale]/admin/producers/[id]/edit/page.js (gates on draft).
 * History:  MEH-2326.
 */
const EMPTY_FORM = { name: "", description: "", price_min: "", price_max: "" };

function validate(f, tErr) {
  const errors = {};
  if (!f.name.trim()) errors.name = tErr("name_required");
  const min = Number(f.price_min);
  if (f.price_min === "") errors.price_min = tErr("price_required");
  else if (!(min >= 1)) errors.price_min = tErr("price_min_too_low");
  else if (min > 10000) errors.price_min = tErr("price_too_high");
  if (f.price_max !== "") {
    const max = Number(f.price_max);
    if (max > 10000) errors.price_max = tErr("price_too_high");
    else if (!errors.price_min && !(max >= min)) errors.price_max = tErr("price_max_below_min");
  }
  return errors;
}

export default function DraftProductsPanel({ producerId, initialProducts = [] }) {
  const t = useTranslations("admin.producers.draft_products");
  const tForm = useTranslations("settings.products.form");
  const tErr = useTranslations("settings.products.errors");
  const tConfirm = useTranslations("settings.products.delete_confirm");
  const tProducts = useTranslations("settings.products");
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const add = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errors = validate(form, tErr);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post(`/admin/producers/${producerId}/products`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_min: Number(form.price_min),
        price_max: form.price_max === "" ? null : Number(form.price_max),
      });
      // Rule 19: a row without an id could never be deleted from here.
      const parsed = DraftProductSchema.safeParse(r.data);
      if (!parsed.success) {
        setError(tErr("save_failed"));
        return;
      }
      setProducts((list) => [...list, { ...r.data, ...parsed.data }]);
      setForm(EMPTY_FORM);
    } catch (error_) {
      setError(detailToMessage(error_?.response?.data?.detail) || tErr("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (productId) => {
    if (deletingId) return;
    setDeletingId(productId);
    setError(null);
    try {
      await api.delete(`/admin/producers/${producerId}/products/${productId}`);
      setProducts((list) => list.filter((p) => p.id !== productId));
      setConfirmId(null);
    } catch (error_) {
      setError(detailToMessage(error_?.response?.data?.detail) || tErr("delete_failed"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      data-testid="draft-products-panel"
      className="bg-white rounded-[12px] border border-border p-6 mb-6 max-w-4xl"
    >
      <h2 className="font-semibold text-lg mb-2 text-primary">{t("title")}</h2>
      <p className="text-sm text-muted mb-4">{t("intro")}</p>

      {products.length === 0 ? (
        <p className="text-sm text-muted mb-4" data-testid="draft-products-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-border" data-testid="draft-products-list">
          {products.map((p) => (
            <li
              key={p.id}
              data-testid="draft-product-row"
              className="py-3 flex flex-wrap items-center gap-3"
            >
              <span className="flex-1 min-w-0">
                <span className="font-medium block truncate">{p.name}</span>
                <span className="text-sm text-muted">
                  {formatPriceRange(p.price_min, p.price_max)}
                </span>
              </span>
              {confirmId === p.id ? (
                <span className="flex items-center gap-2" data-testid="draft-product-confirm">
                  <span className="text-sm">{tConfirm("title", { name: p.name })}</span>
                  <button
                    type="button"
                    data-testid="draft-product-confirm-delete"
                    onClick={() => remove(p.id)}
                    disabled={deletingId === p.id}
                    className="min-h-[44px] px-4 rounded-[12px] bg-error hover:opacity-90 text-white text-sm disabled:opacity-50"
                  >
                    {tConfirm("confirm")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    disabled={deletingId === p.id}
                    className="min-h-[44px] px-4 rounded-[12px] border border-border text-sm"
                  >
                    {tConfirm("cancel")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="draft-product-delete"
                  aria-label={tProducts("card.delete_aria_template", { name: p.name })}
                  onClick={() => setConfirmId(p.id)}
                  className="min-h-[44px] px-4 rounded-[12px] border border-border text-sm hover:bg-background"
                >
                  {tConfirm("confirm")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-sm text-error mb-4" role="alert" data-testid="draft-products-error">
          {error}
        </p>
      )}

      <form onSubmit={add} noValidate data-testid="draft-product-form" className="space-y-3">
        <h3 className="font-medium">{tProducts("add_heading")}</h3>
        <Input
          id="draft-product-name"
          label={tForm("name_label")}
          placeholder={tForm("name_placeholder")}
          value={form.name}
          onChange={set("name")}
          error={fieldErrors.name}
          required
        />
        <Input
          id="draft-product-description"
          label={tForm("description_label")}
          placeholder={tForm("description_placeholder")}
          value={form.description}
          onChange={set("description")}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            id="draft-product-price-min"
            type="number"
            inputMode="decimal"
            label={tForm("price_min_label")}
            placeholder={tForm("price_min_placeholder")}
            value={form.price_min}
            onChange={set("price_min")}
            error={fieldErrors.price_min}
            required
          />
          <Input
            id="draft-product-price-max"
            type="number"
            inputMode="decimal"
            label={`${tForm("price_max_label")} (${tForm("price_max_optional_suffix")})`}
            placeholder={tForm("price_max_placeholder")}
            value={form.price_max}
            onChange={set("price_max")}
            error={fieldErrors.price_max}
          />
        </div>
        <button
          type="submit"
          data-testid="draft-product-add"
          disabled={saving}
          className="min-h-[44px] bg-primary text-white rounded-[12px] px-6 py-2 text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50"
        >
          {saving ? tProducts("add_submitting") : tProducts("add_submit_cta")}
        </button>
      </form>
    </section>
  );
}
