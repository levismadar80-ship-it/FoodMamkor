"use client";

/**
 * RecipeForm — MEH-590 chunk 3/4 of the producer-recipes epic.
 *
 * Shared producer-recipe form for /producer/dashboard/recipes (create
 * via inline toggle) and /producer/dashboard/recipes/[id]/edit (PATCH).
 *
 * Pattern mirrored from frontend/components/HomeProductForm.jsx (single
 * image upload via POST /upload/image + react useState + showToast).
 * RTL-only logical properties per .claude/rules/rtl.md.
 *
 * Props:
 *   mode      — "create" | "edit"
 *   initial   — initial form values (for edit). When omitted, defaults to empty.
 *   onSaved   — callback(recipe) fired after a successful save.
 *   onCancel  — optional callback for a "Cancel" button.
 *
 * On REJECTED (Claude pre-check):
 *   The backend returns 400 with detail.error="recipe_rejected".
 *   The UI surfaces the reason inline; submit is re-enabled so the
 *   producer can edit and retry.
 */

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { Leaf } from "@phosphor-icons/react";

const baseInput =
  "w-full border border-border rounded-[10px] px-3 py-2 bg-white text-right focus-visible:ring-2 focus-visible:ring-primary/40 outline-none";

const EMPTY = {
  title: "",
  description: "",
  ingredients: "",
  instructions: "",
  prep_time_min: "",
  cook_time_min: "",
  servings: "",
  image_url: "",
  product_ids: [],
};

function toInt(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export default function RecipeForm({ mode = "create", initial, onSaved, onCancel }) {
  const t = useTranslations("recipes.form");
  // MEH-848: shared generic error copy (collapsed from recipes.form.errors.generic).
  const tError = useTranslations("error");
  // MEH-1096: per-instance id prefix so label↔control ids never collide if two
  // RecipeForms ever mount on one page (modal + inline, etc.).
  const uid = useId();
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}) });
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Producer's own products for the multi-select picker.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/producers/me/products")
      .then((r) => {
        if (!cancelled) setProducts(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const toggleProduct = (productId) => {
    const has = form.product_ids.includes(productId);
    setForm({
      ...form,
      product_ids: has
        ? form.product_ids.filter((id) => id !== productId)
        : [...form.product_ids, productId],
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/upload/image", formData);
      setForm((f) => ({ ...f, image_url: res.data.url }));
    } catch (err) {
      showToast.error(detailToMessage(err.response?.data?.detail) || t("errors.upload_image_failed"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description?.trim() || null,
        ingredients: form.ingredients.trim(),
        instructions: form.instructions.trim(),
        prep_time_min: toInt(form.prep_time_min),
        cook_time_min: toInt(form.cook_time_min),
        servings: toInt(form.servings),
        image_url: form.image_url || null,
        product_ids: form.product_ids,
      };
      const res =
        mode === "edit" && initial?.id
          ? await api.patch(`/producers/me/recipes/${initial.id}`, payload)
          : await api.post("/producers/me/recipes", payload);
      showToast.success(
        mode === "edit" ? t("toast_updated") : t("toast_created"),
        mode === "edit" ? undefined : { icon: <Leaf size={18} /> },
      );
      onSaved?.(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail?.error === "recipe_rejected") {
        setError(detail.reason || t("errors.rejected_default"));
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError(tError("generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 bg-white rounded-[16px] border border-border p-6"
    >
      <h2 className="font-headline-md text-lg font-bold text-text">
        {mode === "edit" ? t("heading_edit") : t("heading_create")}
      </h2>

      <div>
        <label htmlFor={`${uid}recipe-title`} className="block text-sm font-medium mb-1">
          {t("title_label")} <span className="text-red-500">*</span>
        </label>
        <input
          id={`${uid}recipe-title`}
          required
          minLength={3}
          maxLength={200}
          value={form.title}
          onChange={set("title")}
          className={baseInput}
          dir="rtl"
        />
      </div>

      <div>
        <label htmlFor={`${uid}recipe-description`} className="block text-sm font-medium mb-1">{t("description_label")}</label>
        <textarea
          id={`${uid}recipe-description`}
          rows={2}
          value={form.description}
          onChange={set("description")}
          className={`${baseInput} resize-none`}
          dir="rtl"
        />
      </div>

      <div>
        <label htmlFor={`${uid}recipe-ingredients`} className="block text-sm font-medium mb-1">
          {t("ingredients_label")} <span className="text-red-500">*</span>
        </label>
        <textarea
          id={`${uid}recipe-ingredients`}
          required
          minLength={10}
          rows={6}
          value={form.ingredients}
          onChange={set("ingredients")}
          className={`${baseInput} resize-y`}
          placeholder={t("ingredients_placeholder")}
          dir="rtl"
        />
      </div>

      <div>
        <label htmlFor={`${uid}recipe-instructions`} className="block text-sm font-medium mb-1">
          {t("instructions_label")} <span className="text-red-500">*</span>
        </label>
        <textarea
          id={`${uid}recipe-instructions`}
          required
          minLength={10}
          rows={8}
          value={form.instructions}
          onChange={set("instructions")}
          className={`${baseInput} resize-y`}
          placeholder={t("instructions_placeholder")}
          dir="rtl"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${uid}recipe-prep-time`} className="block text-sm font-medium mb-1">{t("prep_time_label")}</label>
          <input
            id={`${uid}recipe-prep-time`}
            type="number"
            min={0}
            max={1440}
            value={form.prep_time_min}
            onChange={set("prep_time_min")}
            className={baseInput}
            dir="ltr"
          />
        </div>
        <div>
          <label htmlFor={`${uid}recipe-cook-time`} className="block text-sm font-medium mb-1">{t("cook_time_label")}</label>
          <input
            id={`${uid}recipe-cook-time`}
            type="number"
            min={0}
            max={1440}
            value={form.cook_time_min}
            onChange={set("cook_time_min")}
            className={baseInput}
            dir="ltr"
          />
        </div>
        <div>
          <label htmlFor={`${uid}recipe-servings`} className="block text-sm font-medium mb-1">{t("servings_label")}</label>
          <input
            id={`${uid}recipe-servings`}
            type="number"
            min={1}
            max={100}
            value={form.servings}
            onChange={set("servings")}
            className={baseInput}
            dir="ltr"
          />
        </div>
      </div>

      <div>
        {/* MEH-1096: group heading, not a control label — the file input below
            is labelled by its own wrapping <label>, so this stays a <span> to
            avoid an orphan-label / multiple-labels a11y violation. */}
        <span className="block text-sm font-medium mb-1">{t("image_label")}</span>
        {form.image_url ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.image_url}
              alt=""
              className="w-24 h-24 object-cover rounded-[10px] border border-border"
            />
            <button
              type="button"
              onClick={() => setForm({ ...form, image_url: "" })}
              className="text-sm text-red-600 hover:underline"
            >
              {t("image_remove")}
            </button>
          </div>
        ) : (
          <label className="inline-flex items-center text-sm border border-dashed border-border rounded-[10px] px-4 py-3 cursor-pointer hover:bg-green-50">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={handleImageUpload}
            />
            {uploading ? t("image_uploading") : t("image_upload")}
          </label>
        )}
      </div>

      <div>
        {/* MEH-1096: group heading for the checkbox list — each checkbox is
            labelled by its own wrapping <label>, so this is a <span>, not an
            orphan control label. */}
        <span className="block text-sm font-medium mb-1">
          {t("related_products_label")}
          <span className="ms-2 text-xs text-fg-muted">
            {t("related_products_hint")}
          </span>
        </span>
        {productsLoading ? (
          <p className="text-sm text-fg-muted">{t("products_loading")}</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-fg-muted">
            {t("no_products")}
          </p>
        ) : (
          <ul className="space-y-1 max-h-48 overflow-y-auto border border-border rounded-[10px] p-2 bg-green-50">
            {products.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 text-sm cursor-pointer py-1">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary"
                    checked={form.product_ids.includes(p.id)}
                    onChange={() => toggleProduct(p.id)}
                  />
                  <span>{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || uploading}
          className="bg-primary text-white px-6 py-2.5 rounded-[10px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
        >
          {submitting ? t("submit_saving") : t("submit")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-fg-muted hover:text-text"
          >
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
