/**
 * Module:   ProductsSection
 * Purpose:  Producer-self CRUD editor for their product catalog (name, price
 *           range, diet flags, image). Self-fetching card — no props.
 * Touches:  /producers/me/products (GET/POST/PUT/DELETE), /upload/image.
 * Does NOT: own the product schema (backend/app/routers/producer_me.py:879-950)
 *           and does NOT edit profile fields (see edit/page.js CategoriesCard /
 *           ImagesCard / LocationCard for the PUT /producers/me editors).
 * Related:  app/[locale]/producer/dashboard/edit/page.js (mount site),
 *           components/ui/EmptyState.jsx, lib/errors.js (detailToMessage).
 * History:  MEH-776 (UIS-026 delete guard); MEH-999 follow-up (extracted from
 *           settings/page.jsx and mounted in the edit tab — was defined but
 *           never rendered); MEH-1809 (unified submit validation: all field
 *           errors computed together, rendered inline via ui/Input, focus to
 *           the first invalid field — replaced the one-at-a-time setError chain).
 */
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Package, Pencil, Plus, Trash, X } from "@phosphor-icons/react";
// MEH-1472: diet chips render the canonical MEH-1418 attribute icon (Phosphor,
// currentColor, aria-hidden) instead of a baked-in emoji — same source the
// FilterSheet diet group uses. `vegetarian` has no icon in the map → text-only,
// exactly as it renders in FilterSheet.
import { chipIcon } from "@/lib/chip-icons";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPriceRange } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";

// MEH-1809: unified submit-validation — every required/range check runs
// together (not one-at-a-time via a setError chain) and lands on its field.
const PRODUCT_FIELD_ORDER = ["name", "price_min", "price_max"];
const PRODUCT_FIELD_ID_SUFFIX = { name: "name", price_min: "price-min", price_max: "price-max" };

function validateProductForm(f, tErr) {
  const errors = {};
  if (!f.name.trim()) errors.name = tErr("name_required");
  if (f.price_min === "") {
    errors.price_min = tErr("price_required");
  } else {
    const minNum = Number(f.price_min);
    if (minNum < 1) errors.price_min = tErr("price_min_too_low");
    else if (minNum > 10000) errors.price_min = tErr("price_too_high");
  }
  if (f.price_max !== "") {
    const maxNum = Number(f.price_max);
    if (maxNum > 10000) errors.price_max = tErr("price_too_high");
    else if (f.price_min !== "" && maxNum < Number(f.price_min)) errors.price_max = tErr("price_max_below_min");
  }
  return errors;
}

// Scroll + focus the first invalid field in form order (GOV.UK pattern).
function focusFirstInvalidProductField(errors, idPrefix) {
  const first = PRODUCT_FIELD_ORDER.find((field) => errors[field]);
  if (!first) return;
  const el = document.getElementById(`${idPrefix}-${PRODUCT_FIELD_ID_SUFFIX[first]}`);
  el?.focus();
  el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
}

function clearFieldError(setErrors, field) {
  setErrors((errs) => (errs[field] ? { ...errs, [field]: undefined } : errs));
}

// MEH-1116: `embedded` drops the card chrome + heading (the edit-tab accordion
// header owns them); `onCountChange` reports the live product count up for the
// accordion's one-line summary. Display-only props — save logic untouched.
// Default (no props) rendering is byte-identical to before.
export default function ProductsSection({ embedded = false, onCountChange } = {}) {
  const t = useTranslations("settings.products");
  const tForm = useTranslations("settings.products.form");
  const tErr = useTranslations("settings.products.errors");
  const tCommon = useTranslations("settings.common");
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", image_url: "", price_min: "", price_max: "", is_gluten_free: false, is_vegan: false, is_vegetarian: false, is_lactose_free: false, is_no_added_sugar: false, is_low_carb: false });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editFormErrors, setEditFormErrors] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  // UIS-026 (MEH-776): in-flight delete guard — blocks rapid-click
  // double-delete of the same product and disables the row's trash button.
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // MEH-1447: { id, name } | null
  const [editUploading, setEditUploading] = useState(false);
  // MEH-1261 F1: a failed catalog fetch is NOT an empty catalog. `loadError`
  // renders a distinct error card + retry instead of the "no products yet"
  // EmptyState; `reloadKey` re-fires the mount fetch on retry.
  const [loadError, setLoadError] = useState(false);
  // MEH-1976: product id → the image src that failed to load. A map rather
  // than a boolean because the thumbs render inside a .map(); one shared flag
  // would blank every sibling when a single image 401s (MEH-1925).
  const [failedThumbs, setFailedThumbs] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    api.get("/producers/me/products")
      .then((r) => setProducts(r.data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  // MEH-1116: single reporting point — fires on fetch, add, and delete alike.
  useEffect(() => {
    if (products !== null) onCountChange?.(products.length);
  }, [products, onCountChange]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      setError(tErr("upload_type"));
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(tErr("upload_size"));
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      // MEH-1261 F3: no auto-persist here (unlike the edit form) — the product
      // doesn't exist yet, so there is nothing to PUT until the Add submit
      // creates it. Closing the form discards the whole draft, image included.
      setForm((f) => ({ ...f, image_url: r.data.url }));
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || tErr("upload_failed_fallback"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const errors = validateProductForm(form, tErr);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      focusFirstInvalidProductField(errors, "new-product");
      return;
    }
    setFormErrors({});
    const minNum = Number(form.price_min);
    const maxNum = form.price_max === "" ? null : Number(form.price_max);
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        description: form.description || null,
        image_url: form.image_url || null,
        price_min: minNum,
        price_max: maxNum,
        is_gluten_free: form.is_gluten_free,
        is_vegan: form.is_vegan,
        is_vegetarian: form.is_vegetarian,
        is_lactose_free: form.is_lactose_free,
        is_no_added_sugar: form.is_no_added_sugar,  // MEH-1934
        is_low_carb: form.is_low_carb,              // MEH-1934
      };
      const r = await api.post("/producers/me/products", body);
      setProducts((p) => [...(p || []), r.data]);
      setForm({ name: "", description: "", image_url: "", price_min: "", price_max: "", is_gluten_free: false, is_vegan: false, is_vegetarian: false, is_lactose_free: false, is_no_added_sugar: false, is_low_carb: false });
      setAdding(false);
      showToast.success(t("toast_added")); // MEH-1446
    } catch {
      setError(tErr("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      description: product.description || "",
      image_url: product.image_url || "",
      price_min: product.price_min != null ? String(Number(product.price_min)) : "",
      price_max: product.price_max != null ? String(Number(product.price_max)) : "",
      is_gluten_free: !!product.is_gluten_free,
      is_vegan: !!product.is_vegan,
      is_vegetarian: !!product.is_vegetarian,
      is_lactose_free: !!product.is_lactose_free,
      is_no_added_sugar: !!product.is_no_added_sugar,  // MEH-1934
      is_low_carb: !!product.is_low_carb,              // MEH-1934
    });
    setError("");
    setEditFormErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError("");
    setEditFormErrors({});
  };

  const handleEditImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      setError(tErr("upload_type"));
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(tErr("upload_size"));
      e.target.value = "";
      return;
    }
    setEditUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setEditForm((f) => ({ ...f, image_url: r.data.url }));
      // MEH-1261 F3: kill the upload≠save trap on the edit form — the image
      // used to persist only on the explicit Save, so closing via X orphaned
      // the upload and the change looked lost. Auto-persist the image alone
      // (partial PUT — name/price edits stay behind the explicit Save, and
      // removal keeps the explicit-Save intent too).
      // REUSES: edit/cards.jsx ImagesCard uploadFiles (MEH-1236, PR #1787).
      try {
        const saved = await api.put(`/producers/me/products/${editingId}`, {
          image_url: r.data.url,
        });
        setProducts((p) => p.map((x) => (x.id === editingId ? saved.data : x)));
      } catch {
        // Uploaded to Cloudinary but the product save failed — the form still
        // holds the image (dirty), so the explicit Save can retry. Never silent.
        setError(tErr("image_autosave_failed"));
      }
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || tErr("upload_failed_fallback"));
    } finally {
      setEditUploading(false);
      e.target.value = "";
    }
  };

  const handleEdit = async (productId, e) => {
    e.preventDefault();
    const errors = validateProductForm(
      { name: editForm.name || "", price_min: editForm.price_min ?? "", price_max: editForm.price_max ?? "" },
      tErr,
    );
    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      focusFirstInvalidProductField(errors, `edit-product-${productId}`);
      return;
    }
    setEditFormErrors({});
    const minNum = Number(editForm.price_min);
    const maxNum = editForm.price_max === "" ? null : Number(editForm.price_max);
    setSavingEdit(true);
    setError("");
    try {
      const body = {
        name: editForm.name.trim(),
        description: editForm.description || null,
        image_url: editForm.image_url || null,
        price_min: minNum,
        price_max: maxNum,
        is_gluten_free: !!editForm.is_gluten_free,
        is_vegan: !!editForm.is_vegan,
        is_vegetarian: !!editForm.is_vegetarian,
        is_lactose_free: !!editForm.is_lactose_free,
        is_no_added_sugar: !!editForm.is_no_added_sugar,  // MEH-1934
        is_low_carb: !!editForm.is_low_carb,              // MEH-1934
      };
      const r = await api.put(`/producers/me/products/${productId}`, body);
      setProducts((p) => p.map((x) => (x.id === productId ? r.data : x)));
      setEditingId(null);
      showToast.success(t("toast_updated")); // MEH-1446
    } catch {
      setError(tErr("save_failed"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id) => {
    if (deletingId) return; // UIS-026: drop overlapping delete clicks
    setDeletingId(id);
    setError("");
    try {
      await api.delete(`/producers/me/products/${id}`);
      setProducts((p) => p.filter((pr) => pr.id !== id));
      showToast.success(t("toast_deleted")); // MEH-1446
      setConfirmDelete(null); // MEH-1447: close the dialog only on a successful DELETE
    } catch {
      setError(tErr("delete_failed")); // MEH-1447: failure keeps the dialog open
    } finally {
      setDeletingId(null);
    }
  };

  // MEH-1447: Escape closes the delete-confirm dialog unless a delete is in
  // flight. Mirrors admin/producers DeleteConfirmDialog (MEH-1023/1027).
  useEffect(() => {
    if (!confirmDelete) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && deletingId == null) setConfirmDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, deletingId]);

  if (loading) return null;

  return (
    <div className={embedded ? "" : "bg-white border border-border rounded-[16px] p-6"}>
      <div className={embedded ? "flex items-center justify-end mb-4" : "flex items-center justify-between mb-4"}>
        {!embedded && (
          <h3 className="font-headline-md text-lg font-bold text-text">{t("section_heading")}</h3>
        )}
        {/* MEH-1097 F14: the top add button is redundant with the EmptyState CTA
            while empty — show it only once products exist (or restores after the
            first add). Empty state → the EmptyState CTA is the single button. */}
        {!adding && products?.length > 0 && (
          <button
            onClick={() => { setAdding(true); setError(""); setFormErrors({}); }}
            className="inline-flex items-center gap-1.5 text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition"
          >
            <Plus size={14} aria-hidden="true" />
            {t("add_cta")}
          </button>
        )}
      </div>

      {/* MEH-1597: card-level "where it appears" line. The MEH-1539 standard
          allows one per card when it covers every field, which it does here —
          name, description and price all surface in the same public list. */}
      <p className="text-xs text-fg-muted mb-3">{t("where")}</p>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {/* MEH-1261 F1: load failure gets its own state — never the EmptyState
          (which invites adding a product to a catalog that may already exist). */}
      {loadError && (
        <div
          role="alert"
          data-testid="products-load-error"
          className="border border-border rounded-[10px] p-4 bg-red-50 text-center"
        >
          <p className="text-sm text-text mb-2">{tErr("load_failed")}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-sm text-primary font-medium hover:underline"
          >
            {t("load_retry_cta")}
          </button>
        </div>
      )}

      {products?.length === 0 && !adding && (
        <EmptyState
          title={t("empty.title")}
          description={t("empty.description")}
          ctaLabel={t("empty.cta")}
          ctaOnClick={() => { setAdding(true); setError(""); setFormErrors({}); }}
          example={
            // MEH-1172: no floating decorative icon — the example card IS the
            // visual (Carbon empty-state pattern). Full opacity, slightly wider.
            <div className="w-full max-w-sm text-start">
              <p className="text-[11px] text-fg-muted mb-1">{t("empty.sample_label")}</p>
              <div className="border border-border rounded-[12px] p-3 bg-surface-card flex items-center gap-3">
                <div className="w-14 h-14 rounded-[8px] bg-green-50 flex items-center justify-center shrink-0">
                  <Package size={22} className="text-fg-muted" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{t("empty.sample_name")}</p>
                  <p className="text-xs text-fg-muted">{t("empty.sample_price")}</p>
                </div>
              </div>
            </div>
          }
        />
      )}

      <div className="space-y-3 mb-4">
        {products?.map((product) => (
          editingId === product.id ? (
            <form
              key={product.id}
              onSubmit={(e) => handleEdit(product.id, e)}
              noValidate
              className="border border-border rounded-[10px] p-4 space-y-5 bg-green-50"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text">{t("edit_heading")}</p>
                <button type="button" onClick={cancelEdit} aria-label={t("cancel_aria")}>
                  <X size={16} className="text-fg-muted" aria-hidden="true" />
                </button>
              </div>
              {product.price_min == null && product.price_range && (
                <p className="text-xs text-fg-muted mb-2">
                  {t("edit_legacy_price_note", { range: product.price_range })}
                </p>
              )}
              {/* MEH-1273 group (a) — details: name + description (tight spacing within, wider between groups). */}
              <div className="space-y-3">
                <div>
                  <Input
                    id={`edit-product-${product.id}-name`}
                    label={tForm("name_label")}
                    required
                    value={editForm.name || ""}
                    onChange={(e) => {
                      setEditForm((f) => ({ ...f, name: e.target.value }));
                      clearFieldError(setEditFormErrors, "name");
                    }}
                    error={editFormErrors.name}
                  />
                </div>
                <div>
                  <Input
                    id={`edit-product-${product.id}-description`}
                    label={tForm("description_label")}
                    value={editForm.description || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>

              {/* MEH-1273 group (b) — price: ₪ inside the input (logical start-3); labels drop "(₪)". */}
              <div className="grid grid-cols-2 gap-2">
                <PriceField
                  id={`edit-product-${product.id}-price-min`}
                  label={tForm("price_min_label")}
                  required
                  value={editForm.price_min || ""}
                  placeholder={tForm("price_min_placeholder")}
                  onChange={(e) => {
                    setEditForm((f) => ({ ...f, price_min: e.target.value }));
                    clearFieldError(setEditFormErrors, "price_min");
                  }}
                  error={editFormErrors.price_min}
                />
                <PriceField
                  id={`edit-product-${product.id}-price-max`}
                  label={tForm("price_max_label")}
                  optionalSuffix={tForm("price_max_optional_suffix")}
                  value={editForm.price_max || ""}
                  placeholder={tForm("price_max_placeholder")}
                  onChange={(e) => {
                    setEditForm((f) => ({ ...f, price_max: e.target.value }));
                    clearFieldError(setEditFormErrors, "price_max");
                  }}
                  error={editFormErrors.price_max}
                />
              </div>

              {/* MEH-1273 group (c) — diet flags (toggle chips) + image. */}
              <div className="space-y-3">
                <div>
                  <p id={`edit-diet-heading-${product.id}`} className="text-xs text-fg-muted mb-2">{tForm("diet_heading")}</p>
                  <div role="group" aria-labelledby={`edit-diet-heading-${product.id}`} className="flex flex-wrap gap-2">
                    <DietChip iconKey="gluten_free" label={tForm("diet_gluten_free")} pressed={!!editForm.is_gluten_free} onToggle={() => setEditForm((f) => ({ ...f, is_gluten_free: !f.is_gluten_free }))} />
                    <DietChip iconKey="vegan" label={tForm("diet_vegan")} pressed={!!editForm.is_vegan} onToggle={() => setEditForm((f) => ({ ...f, is_vegan: !f.is_vegan }))} />
                    <DietChip iconKey="vegetarian" label={tForm("diet_vegetarian")} pressed={!!editForm.is_vegetarian} onToggle={() => setEditForm((f) => ({ ...f, is_vegetarian: !f.is_vegetarian }))} />
                    <DietChip iconKey="lactose_free" label={tForm("diet_lactose_free")} pressed={!!editForm.is_lactose_free} onToggle={() => setEditForm((f) => ({ ...f, is_lactose_free: !f.is_lactose_free }))} />
                    {/* MEH-1934: appended last so the existing diet order is unchanged. No new chip-icons entry — same as vegetarian, which renders iconless. */}
                    <DietChip iconKey="no_added_sugar" label={tForm("diet_no_added_sugar")} pressed={!!editForm.is_no_added_sugar} onToggle={() => setEditForm((f) => ({ ...f, is_no_added_sugar: !f.is_no_added_sugar }))} />
                    <DietChip iconKey="low_carb" label={tForm("diet_low_carb")} pressed={!!editForm.is_low_carb} onToggle={() => setEditForm((f) => ({ ...f, is_low_carb: !f.is_low_carb }))} />
                  </div>
                  {/* MEH-1439: tell the owner what marking a diet flag does — it
                      surfaces the business in the matching public filter. */}
                  <p className="text-xs text-fg-muted mt-2">{tForm("diet_helper")}</p>
                </div>
                <div>
                  {/* MEH-1096: group heading — file input below is labelled by its
                      own wrapping <label>, so this stays a <span>. */}
                  <span className="text-xs text-fg-muted mb-1 block">{tForm("image_label")}</span>
                  <UploadZone
                    imageUrl={editForm.image_url}
                    uploading={editUploading}
                    onUpload={handleEditImageUpload}
                    onRemove={() => setEditForm((f) => ({ ...f, image_url: "" }))}
                    tForm={tForm}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingEdit || editUploading}
                  className="flex-1 bg-primary text-white rounded-[8px] py-2 text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50"
                >
                  {savingEdit ? t("save_edit_saving") : t("save_edit_cta")}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 bg-white border border-border text-text rounded-[8px] py-2 text-sm font-medium hover:bg-green-50 transition"
                >
                  {t("cancel_edit_cta")}
                </button>
              </div>
            </form>
          ) : (
            <div key={product.id} className="flex items-center gap-3 p-3 rounded-[10px] bg-green-50">
              {product.image_url && failedThumbs[product.id] !== product.image_url ? (
                <div className="relative w-12 h-12 shrink-0 rounded-[6px] overflow-hidden">
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="48px"
                    // MEH-1976: a 401 here previously rendered a broken glyph.
                    // Keyed by product id because this row is inside a .map —
                    // one flag would blank every sibling thumb.
                    onError={() =>
                      setFailedThumbs((prev) => ({ ...prev, [product.id]: product.image_url }))
                    }
                  />
                </div>
              ) : (
                <div className="w-12 h-12 shrink-0 rounded-[6px] bg-white border border-border flex items-center justify-center">
                  <Package size={20} className="text-fg-muted/60" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-text truncate">{product.name}</p>
                {(() => {
                  if (product.price_min != null)
                    return <p className="text-xs text-accent">{formatPriceRange(product.price_min, product.price_max)}</p>;
                  if (product.price_range)
                    return <p className="text-xs text-accent">{product.price_range}</p>;
                  return null;
                })()}
              </div>
              <button
                onClick={() => startEdit(product)}
                aria-label={t("card.edit_aria_template", { name: product.name })}
                className="p-1.5 rounded-[6px] text-fg-muted hover:text-primary hover:bg-primary/5 transition"
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button
                onClick={() => { setError(""); setConfirmDelete({ id: product.id, name: product.name }); }}
                disabled={deletingId === product.id}
                aria-label={t("card.delete_aria_template", { name: product.name })}
                className="p-1.5 rounded-[6px] text-fg-muted hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            </div>
          )
        ))}
      </div>

      {adding && (
        <form onSubmit={handleAdd} noValidate className="border border-border rounded-[10px] p-4 space-y-5 bg-green-50">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text">{t("add_heading")}</p>
            <button type="button" onClick={() => { setAdding(false); setError(""); setFormErrors({}); }} aria-label={t("cancel_aria")}>
              <X size={16} className="text-fg-muted" aria-hidden="true" />
            </button>
          </div>
          {/* MEH-1273 group (a) — details: name + description. */}
          <div className="space-y-3">
            <div>
              <Input
                id="new-product-name"
                label={tForm("name_label")}
                required
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  clearFieldError(setFormErrors, "name");
                }}
                placeholder={tForm("name_placeholder")}
                error={formErrors.name}
              />
            </div>
            <div>
              <Input
                id="new-product-description"
                label={tForm("description_label")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={tForm("description_placeholder")}
              />
            </div>
          </div>

          {/* MEH-1273 group (b) — price: ₪ inside the input (logical start-3); labels drop "(₪)". */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <PriceField
                id="new-product-price-min"
                label={tForm("price_min_label")}
                required
                value={form.price_min}
                placeholder={tForm("price_min_placeholder")}
                onChange={(e) => {
                  setForm((f) => ({ ...f, price_min: e.target.value }));
                  clearFieldError(setFormErrors, "price_min");
                }}
                error={formErrors.price_min}
              />
              <PriceField
                id="new-product-price-max"
                label={tForm("price_max_label")}
                optionalSuffix={tForm("price_max_optional_suffix")}
                value={form.price_max}
                placeholder={tForm("price_max_placeholder")}
                onChange={(e) => {
                  setForm((f) => ({ ...f, price_max: e.target.value }));
                  clearFieldError(setFormErrors, "price_max");
                }}
                error={formErrors.price_max}
              />
            </div>
            {/* MEH-1239: clarify the price pair — single price vs range (Wolt/Shopify). */}
            <p className="text-xs text-fg-muted">{tForm("price_hint")}</p>
          </div>

          {/* MEH-1273 group (c) — diet flags (toggle chips) + image. */}
          <div className="space-y-3">
            <div>
              <p id="add-diet-heading" className="text-xs text-fg-muted mb-2">{tForm("diet_heading")}</p>
              <div role="group" aria-labelledby="add-diet-heading" className="flex flex-wrap gap-2">
                <DietChip iconKey="gluten_free" label={tForm("diet_gluten_free")} pressed={form.is_gluten_free} onToggle={() => setForm((f) => ({ ...f, is_gluten_free: !f.is_gluten_free }))} />
                <DietChip iconKey="vegan" label={tForm("diet_vegan")} pressed={form.is_vegan} onToggle={() => setForm((f) => ({ ...f, is_vegan: !f.is_vegan }))} />
                <DietChip iconKey="vegetarian" label={tForm("diet_vegetarian")} pressed={form.is_vegetarian} onToggle={() => setForm((f) => ({ ...f, is_vegetarian: !f.is_vegetarian }))} />
                <DietChip iconKey="lactose_free" label={tForm("diet_lactose_free")} pressed={form.is_lactose_free} onToggle={() => setForm((f) => ({ ...f, is_lactose_free: !f.is_lactose_free }))} />
                {/* MEH-1934 */}
                <DietChip iconKey="no_added_sugar" label={tForm("diet_no_added_sugar")} pressed={form.is_no_added_sugar} onToggle={() => setForm((f) => ({ ...f, is_no_added_sugar: !f.is_no_added_sugar }))} />
                <DietChip iconKey="low_carb" label={tForm("diet_low_carb")} pressed={form.is_low_carb} onToggle={() => setForm((f) => ({ ...f, is_low_carb: !f.is_low_carb }))} />
              </div>
              {/* MEH-1439: tell the owner what marking a diet flag does — it
                  surfaces the business in the matching public filter. */}
              <p className="text-xs text-fg-muted mt-2">{tForm("diet_helper")}</p>
            </div>
            <div>
              {/* MEH-1096: group heading — file input below is labelled by its
                  own wrapping <label>, so this stays a <span>. */}
              <span className="text-xs text-fg-muted mb-1 block">{tForm("image_label")}</span>
              <UploadZone
                imageUrl={form.image_url}
                uploading={uploading}
                onUpload={handleImageUpload}
                onRemove={() => setForm((f) => ({ ...f, image_url: "" }))}
                tForm={tForm}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 bg-primary text-white rounded-[8px] py-2 text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50"
            >
              {saving ? t("add_submitting") : t("add_submit_cta")}
            </button>
          </div>
        </form>
      )}

      {/* MEH-1447: confirm before DELETE (replaces one-click delete). Contract
          copied from admin/producers DeleteConfirmDialog (MEH-1023/1027):
          aria-modal, Escape closes, buttons disabled while busy, failure keeps
          the dialog open with the error shown. */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-delete-title"
            className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full text-start space-y-3"
          >
            <p id="product-delete-title" className="font-medium text-base text-text">
              {t("delete_confirm.title", { name: confirmDelete.name })}
            </p>
            <p className="text-sm text-fg-muted">{t("delete_confirm.body")}</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 justify-start pt-1">
              <button
                type="button"
                disabled={deletingId != null}
                onClick={() => handleDelete(confirmDelete.id)}
                className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {t("delete_confirm.confirm")}
              </button>
              <button
                type="button"
                disabled={deletingId != null}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-[10px] text-sm border border-border text-fg-muted hover:bg-gray-50 transition disabled:opacity-50"
              >
                {t("delete_confirm.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// MEH-1273: presentational helpers — local to ProductsSection (inline
// duplication, not a shared component). Save/upload logic stays in the parent;
// these own layout only.

// Price field with the ₪ adornment rendered INSIDE the input, via the
// canonical Input startAdornment (MEH-1809 — was a hand-rolled duplicate of
// this same primitive; now reuses it directly, error prop included).
// MEH-1597: `placeholder` added so the two price inputs can carry an example
// like every other field in the card. Plain number, no ₪ — the currency glyph
// is already rendered inside the input below, and products are numeric since
// MEH-295.
function PriceField({ id, label, optionalSuffix, value, onChange, placeholder, required = false, error }) {
  return (
    <Input
      id={id}
      label={
        optionalSuffix ? (
          <>
            {label}
            <span className="text-fg-muted"> {optionalSuffix}</span>
          </>
        ) : (
          label
        )
      }
      required={required}
      type="number"
      min={1}
      max={10000}
      step={0.5}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      startAdornment="₪"
      error={error}
    />
  );
}

// Diet flag as a toggleable chip (≥44px tap target, aria-pressed, focus ring).
// REUSES: components/CategorySelector.jsx:163-200 selected idiom
// (border-primary bg-green-50 vs border-border hover:border-primary) — ADR-019
// states via the primary/cream family, no new state token.
function DietChip({ label, pressed, onToggle, iconKey }) {
  // MEH-1472: leading Phosphor glyph from the canonical chip-icon map. null for
  // keys without an icon (e.g. vegetarian) → the chip stays text-only, matching
  // FilterSheet. Wrapped aria-hidden so the label remains the accessible name.
  const icon = iconKey ? chipIcon(iconKey) : null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      className={[
        "inline-flex items-center gap-1.5 min-h-[44px] rounded-[10px] border px-4 py-2 text-sm text-start transition focus-ring",
        pressed
          ? "border-primary bg-green-50 text-text"
          : "border-border bg-white text-text hover:border-primary",
      ].join(" ")}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
    </button>
  );
}

// Click-to-upload zone with thumbnail preview + replace/remove affordance.
// REUSES: app/[locale]/producer/dashboard/events/new/page.js:251-288 (dashed
// click-to-upload label + thumbnail/remove). Upload handler stays in the parent.
function UploadZone({ imageUrl, uploading, onUpload, onRemove, tForm }) {
  // MEH-1976: must precede the `if (imageUrl)` return — hooks cannot be
  // conditional. Holds the src that failed to load, so a new imageUrl clears
  // it during render with no effect.
  const [failedSrc, setFailedSrc] = useState(null);
  if (imageUrl && failedSrc !== imageUrl) {
    return (
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 rounded-[8px] overflow-hidden shrink-0 border border-border">
          <Image src={imageUrl} alt={tForm("image_alt")} fill className="object-cover" sizes="64px" onError={() => setFailedSrc(imageUrl)} />
        </div>
        {/* MEH-2033: sr-only (NOT hidden) keeps the input in the tab order —
            display:none removes it and the wrapping label is not natively
            focusable (WCAG 2.1.1). Ring on focus-within is the keyboard
            affordance; this label has no border, so the ring alone carries it. */}
        <label className="cursor-pointer text-sm text-primary hover:underline rounded-[4px] focus-within:ring-2 focus-within:ring-primary/30">
          {uploading ? tForm("image_uploading") : tForm("image_replace")}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onUpload}
            disabled={uploading}
          />
        </label>
        <button type="button" onClick={onRemove} className="text-sm text-red-500 hover:underline">
          {tForm("image_remove")}
        </button>
      </div>
    );
  }
  // MEH-2033: sr-only + focus-within — same keyboard-reachability fix as
  // EventForm (MEH-2031) / ExperienceForm (MEH-2012), word for word.
  return (
    <label className="flex flex-col items-center justify-center gap-1 text-center text-sm text-fg-muted border border-dashed border-border rounded-[8px] px-4 py-6 cursor-pointer hover:bg-green-50 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      <Package size={20} className="text-fg-muted" aria-hidden="true" />
      <span>{uploading ? tForm("image_uploading") : tForm("image_upload_cta")}</span>
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={onUpload}
        disabled={uploading}
      />
    </label>
  );
}
