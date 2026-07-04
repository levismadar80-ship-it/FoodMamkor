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
  const remove = async (id) => {
    if (!confirm(t("content.categories.confirm_delete"))) return;
    await api.delete(`/admin/categories/${id}`);
    load();
  };

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
      <button onClick={() => onDelete(cat.id)} className="text-xs text-red-600">{t("content.categories.delete")}</button>
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
