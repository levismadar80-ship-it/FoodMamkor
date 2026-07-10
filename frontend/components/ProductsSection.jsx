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
 *           never rendered).
 */
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Carrot, Package, Pencil, Plus, Trash, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import EmptyState from "@/components/ui/EmptyState";

export default function ProductsSection() {
  const t = useTranslations("settings.products");
  const tForm = useTranslations("settings.products.form");
  const tErr = useTranslations("settings.products.errors");
  const tCommon = useTranslations("settings.common");
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", image_url: "", price_min: "", price_max: "", is_gluten_free: false, is_vegan: false, is_lactose_free: false });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  // UIS-026 (MEH-776): in-flight delete guard — blocks rapid-click
  // double-delete of the same product and disables the row's trash button.
  const [deletingId, setDeletingId] = useState(null);
  const [editUploading, setEditUploading] = useState(false);

  useEffect(() => {
    api.get("/producers/me/products")
      .then((r) => setProducts(r.data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

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
    if (!form.name.trim()) { setError(tErr("name_required")); return; }
    if (form.price_min === "") { setError(tErr("price_required")); return; }
    const minNum = Number(form.price_min);
    const maxNum = form.price_max === "" ? null : Number(form.price_max);
    if (minNum < 1) { setError(tErr("price_min_too_low")); return; }
    if (minNum > 10000 || (maxNum !== null && maxNum > 10000)) { setError(tErr("price_too_high")); return; }
    if (maxNum !== null && maxNum < minNum) { setError(tErr("price_max_below_min")); return; }
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
        is_lactose_free: form.is_lactose_free,
      };
      const r = await api.post("/producers/me/products", body);
      setProducts((p) => [...(p || []), r.data]);
      setForm({ name: "", description: "", image_url: "", price_min: "", price_max: "", is_gluten_free: false, is_vegan: false, is_lactose_free: false });
      setAdding(false);
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
      is_lactose_free: !!product.is_lactose_free,
    });
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError("");
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
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || tErr("upload_failed_fallback"));
    } finally {
      setEditUploading(false);
      e.target.value = "";
    }
  };

  const handleEdit = async (productId, e) => {
    e.preventDefault();
    if (!editForm.name?.trim()) { setError(tErr("name_required")); return; }
    if (editForm.price_min === "") { setError(tErr("price_required")); return; }
    const minNum = Number(editForm.price_min);
    const maxNum = editForm.price_max === "" ? null : Number(editForm.price_max);
    if (minNum < 1) { setError(tErr("price_min_too_low")); return; }
    if (minNum > 10000 || (maxNum !== null && maxNum > 10000)) { setError(tErr("price_too_high")); return; }
    if (maxNum !== null && maxNum < minNum) { setError(tErr("price_max_below_min")); return; }
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
        is_lactose_free: !!editForm.is_lactose_free,
      };
      const r = await api.put(`/producers/me/products/${productId}`, body);
      setProducts((p) => p.map((x) => (x.id === productId ? r.data : x)));
      setEditingId(null);
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
    } catch {
      setError(tErr("delete_failed"));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-border rounded-[16px] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-md text-lg font-bold text-text">{t("section_heading")}</h3>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setError(""); }}
            className="inline-flex items-center gap-1.5 text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition"
          >
            <Plus size={14} aria-hidden="true" />
            {t("add_cta")}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {products?.length === 0 && !adding && (
        <EmptyState
          icon={Carrot}
          title={t("empty.title")}
          description={t("empty.description")}
          ctaLabel={t("empty.cta")}
          ctaOnClick={() => { setAdding(true); setError(""); }}
        />
      )}

      <div className="space-y-3 mb-4">
        {products?.map((product) => (
          editingId === product.id ? (
            <form
              key={product.id}
              onSubmit={(e) => handleEdit(product.id, e)}
              className="border border-border rounded-[10px] p-4 space-y-3 bg-green-50"
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
              <div>
                <label htmlFor={`edit-product-${product.id}-name`} className="text-xs text-fg-muted mb-1 block">{tForm("name_label")}</label>
                <input
                  id={`edit-product-${product.id}-name`}
                  required
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor={`edit-product-${product.id}-description`} className="text-xs text-fg-muted mb-1 block">{tForm("description_label")}</label>
                <input
                  id={`edit-product-${product.id}-description`}
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`edit-product-${product.id}-price-min`} className="text-xs text-fg-muted mb-1 block">{tForm("price_min_label")}</label>
                  <input
                    id={`edit-product-${product.id}-price-min`}
                    required
                    type="number"
                    min={1}
                    max={10000}
                    step={0.5}
                    value={editForm.price_min || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, price_min: e.target.value }))}
                    className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor={`edit-product-${product.id}-price-max`} className="text-xs text-fg-muted mb-1 block">{tForm("price_max_label")} <span className="text-fg-muted">{tForm("price_max_optional_suffix")}</span></label>
                  <input
                    id={`edit-product-${product.id}-price-max`}
                    type="number"
                    min={1}
                    max={10000}
                    step={0.5}
                    value={editForm.price_max || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, price_max: e.target.value }))}
                    className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-fg-muted mb-2">{tForm("diet_heading")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.is_gluten_free}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_gluten_free: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>{tForm("diet_gluten_free")}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.is_vegan}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_vegan: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>{tForm("diet_vegan")}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.is_lactose_free}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_lactose_free: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>{tForm("diet_lactose_free")}</span>
                  </label>
                </div>
              </div>
              <div>
                {/* MEH-1096: group heading — file input below is labelled by its
                    own wrapping <label>, so this stays a <span>. */}
                <span className="text-xs text-fg-muted mb-1 block">{tForm("image_label")}</span>
                {editForm.image_url ? (
                  <div className="flex items-center gap-2">
                    <div className="relative w-12 h-12 rounded-[6px] overflow-hidden shrink-0">
                      <Image src={editForm.image_url} alt={tForm("image_alt")} fill className="object-cover" sizes="48px" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, image_url: "" }))}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {tForm("image_remove")}
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition">
                    <Package size={14} aria-hidden="true" />
                    {editUploading ? tForm("image_uploading") : tForm("image_upload_cta")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleEditImageUpload}
                      disabled={editUploading}
                    />
                  </label>
                )}
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
              {product.image_url ? (
                <div className="relative w-12 h-12 shrink-0 rounded-[6px] overflow-hidden">
                  <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="48px" />
                </div>
              ) : (
                <div className="w-12 h-12 shrink-0 rounded-[6px] bg-white border border-border flex items-center justify-center">
                  <Package size={20} className="text-fg-muted/60" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-text truncate">{product.name}</p>
                {(() => {
                  if (product.price_min != null && product.price_max != null)
                    return <p className="text-xs text-accent">₪{Number(product.price_min)}–₪{Number(product.price_max)}</p>;
                  if (product.price_min != null)
                    return <p className="text-xs text-accent">₪{Number(product.price_min)}</p>;
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
                onClick={() => handleDelete(product.id)}
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
        <form onSubmit={handleAdd} className="border border-border rounded-[10px] p-4 space-y-3 bg-green-50">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text">{t("add_heading")}</p>
            <button type="button" onClick={() => { setAdding(false); setError(""); }} aria-label={t("cancel_aria")}>
              <X size={16} className="text-fg-muted" aria-hidden="true" />
            </button>
          </div>
          <div>
            <label htmlFor="new-product-name" className="text-xs text-fg-muted mb-1 block">{tForm("name_label")}</label>
            <input
              id="new-product-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="new-product-description" className="text-xs text-fg-muted mb-1 block">{tForm("description_label")}</label>
            <input
              id="new-product-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="new-product-price-min" className="text-xs text-fg-muted mb-1 block">{tForm("price_min_label")}</label>
              <input
                id="new-product-price-min"
                required
                type="number"
                min={1}
                max={10000}
                step={0.5}
                value={form.price_min}
                onChange={(e) => setForm((f) => ({ ...f, price_min: e.target.value }))}
                className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="new-product-price-max" className="text-xs text-fg-muted mb-1 block">{tForm("price_max_label")} <span className="text-fg-muted">{tForm("price_max_optional_suffix")}</span></label>
              <input
                id="new-product-price-max"
                type="number"
                min={1}
                max={10000}
                step={0.5}
                value={form.price_max}
                onChange={(e) => setForm((f) => ({ ...f, price_max: e.target.value }))}
                className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-fg-muted mb-2">{tForm("diet_heading")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_gluten_free}
                  onChange={(e) => setForm((f) => ({ ...f, is_gluten_free: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span>{tForm("diet_gluten_free")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_vegan}
                  onChange={(e) => setForm((f) => ({ ...f, is_vegan: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span>{tForm("diet_vegan")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_lactose_free}
                  onChange={(e) => setForm((f) => ({ ...f, is_lactose_free: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span>{tForm("diet_lactose_free")}</span>
              </label>
            </div>
          </div>
          <div>
            {/* MEH-1096: group heading — file input below is labelled by its
                own wrapping <label>, so this stays a <span>. */}
            <span className="text-xs text-fg-muted mb-1 block">{tForm("image_label")}</span>
            {form.image_url ? (
              <div className="flex items-center gap-2">
                <div className="relative w-12 h-12 rounded-[6px] overflow-hidden shrink-0">
                  <Image src={form.image_url} alt={tForm("image_alt")} fill className="object-cover" sizes="48px" />
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                  className="text-xs text-red-500 hover:underline"
                >
                  {tForm("image_remove")}
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition">
                <Package size={14} aria-hidden="true" />
                {uploading ? tForm("image_uploading") : tForm("image_upload_cta")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
            )}
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
    </div>
  );
}
