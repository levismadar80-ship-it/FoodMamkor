"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";

export default function AdminContentPage() {
  const t = useTranslations("admin");
  const [section, setSection] = useState("categories");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t("content.title")}</h1>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: "categories", label: t("content.tabs.categories") },
          { id: "about", label: t("content.tabs.about") },
          { id: "terms", label: t("content.tabs.terms") },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-1.5 rounded-[12px] text-sm transition ${
              section === s.id ? "bg-primary text-white" : "bg-white border border-border hover:bg-accent"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "categories" && <CategoriesEditor />}
      {(section === "about" || section === "terms") && <PageEditor slug={section} />}
    </div>
  );
}

function CategoriesEditor() {
  const t = useTranslations("admin");
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  // MEH-1023 Chunk B: replaces the native browser confirm with a modal dialog showing
  // the category name. { id, name } while a delete is pending; null otherwise.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { load(); }, []);
  const load = () => api.get("/admin/categories").then((r) => setItems(r.data));

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post("/admin/categories", { name });
    setName("");
    load();
  };
  const update = async (id, name) => {
    await api.put(`/admin/categories/${id}`, { name });
    load();
  };
  // Open the confirm dialog; the DELETE call only fires from confirmRemove.
  const remove = (cat) => setConfirmDelete({ id: cat.id, name: cat.name });
  const confirmRemove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/categories/${confirmDelete.id}`);
      load();
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  // Escape closes the dialog (unless a delete is mid-flight). Mirrors the
  // AdminRowMenu (Chunk A) dismissal contract; the users/page.js modal we
  // otherwise mirror predates it.
  useEffect(() => {
    if (!confirmDelete) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !deleting) setConfirmDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, deleting]);

  return (
    <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
      <form onSubmit={create} className="flex gap-2">
        <input
          placeholder={t("content.categories.name_placeholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 border border-border rounded-[12px] px-3 py-2"
        />
        <button type="submit" className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm">
          {t("content.categories.add")}
        </button>
      </form>

      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-muted text-center py-4">{t("content.categories.empty")}</li>
        ) : (
          items.map((c) => (
            <CategoryRow key={c.id} cat={c} onSave={update} onDelete={remove} />
          ))
        )}
      </ul>

      {/* Confirmation modal — mirrors users/page.js confirm dialog pattern (MEH-1023 Chunk B) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-delete-title"
            className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full mx-4 text-end space-y-4"
          >
            <p id="category-delete-title" className="font-medium text-base">
              {t("content.categories.confirm_delete", { name: confirmDelete.name })}
            </p>
            <div className="flex gap-3 justify-start">
              <button
                disabled={deleting}
                onClick={confirmRemove}
                className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("content.categories.deleting") : t("content.categories.delete")}
              </button>
              <button
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-[10px] text-sm border border-border text-muted hover:bg-gray-50 transition disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRow({ cat, onSave, onDelete }) {
  const t = useTranslations("admin");
  const [name, setName] = useState(cat.name);
  const dirty = name !== cat.name;

  return (
    <li className="flex gap-2 items-center border border-border rounded-[12px] p-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-border rounded-lg px-2 py-1" />
      <button
        onClick={() => onSave(cat.id, name)}
        disabled={!dirty}
        className="text-xs bg-primary text-white px-3 py-1 rounded-lg disabled:opacity-30"
      >
        {t("content.categories.save")}
      </button>
      <button onClick={() => onDelete(cat)} className="text-xs text-red-600">{t("content.categories.delete")}</button>
    </li>
  );
}

function PageEditor({ slug }) {
  const t = useTranslations("admin");
  const [page, setPage] = useState({ title: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
    api.get(`/admin/pages/${slug}`).then((r) => setPage(r.data));
  }, [slug]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/pages/${slug}`, { title: page.title, body: page.body });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-[12px] p-5 space-y-3">
      <input
        value={page.title}
        onChange={(e) => { setPage({ ...page, title: e.target.value }); setSaved(false); }}
        placeholder={t("content.page_editor.title_placeholder")}
        className="w-full border border-border rounded-[12px] px-3 py-2 font-semibold"
      />
      <textarea
        value={page.body}
        onChange={(e) => { setPage({ ...page, body: e.target.value }); setSaved(false); }}
        placeholder={t("content.page_editor.body_placeholder")}
        rows={16}
        className="w-full border border-border rounded-[12px] px-3 py-2 font-mono text-sm"
      />
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm disabled:opacity-50">
          {saving ? t("content.page_editor.saving") : t("content.page_editor.save")}
        </button>
        {saved && <span className="text-sm text-primary">{t("content.page_editor.saved")}</span>}
      </div>
    </div>
  );
}
