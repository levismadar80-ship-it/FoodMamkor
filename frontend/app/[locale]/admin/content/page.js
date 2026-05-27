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
          { id: "home_products", label: t("content.tabs.home_products") },
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
      {section === "home_products" && <HiddenHomeProducts />}
      {(section === "about" || section === "terms") && <PageEditor slug={section} />}
    </div>
  );
}

function CategoriesEditor() {
  const t = useTranslations("admin");
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");

  useEffect(() => { load(); }, []);
  const load = () => api.get("/admin/categories").then((r) => setItems(r.data));

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post("/admin/categories", { name, emoji });
    setName("");
    setEmoji("");
    load();
  };
  const update = async (id, name, emoji) => {
    await api.put(`/admin/categories/${id}`, { name, emoji });
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
          placeholder={t("content.categories.emoji_placeholder")}
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-2 w-20 text-center"
        />
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
  const [emoji, setEmoji] = useState(cat.emoji || "");
  const dirty = name !== cat.name || emoji !== (cat.emoji || "");

  return (
    <li className="flex gap-2 items-center border border-border rounded-[12px] p-2">
      <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="border border-border rounded-lg px-2 py-1 w-16 text-center" />
      <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-border rounded-lg px-2 py-1" />
      <button
        onClick={() => onSave(cat.id, name, emoji)}
        disabled={!dirty}
        className="text-xs bg-primary text-white px-3 py-1 rounded-lg disabled:opacity-30"
      >
        {t("content.categories.save")}
      </button>
      <button onClick={() => onDelete(cat.id)} className="text-xs text-red-600">{t("content.categories.delete")}</button>
    </li>
  );
}

function HiddenHomeProducts() {
  const t = useTranslations("admin");
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/admin/home-products/hidden").then((r) => setItems(r.data)).catch(() => setItems([]));
  }, []);

  const restore = async (id) => {
    await api.post(`/admin/home-products/${id}/restore`);
    setItems(items.filter((i) => i.id !== id));
  };
  const remove = async (id) => {
    if (!confirm(t("content.home_products.confirm_delete"))) return;
    await api.delete(`/admin/home-products/${id}`);
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="bg-white border border-border rounded-[12px] p-5">
      <h2 className="font-semibold mb-3">{t("content.home_products.heading")}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t("content.home_products.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((hp) => (
            <li key={hp.id} className="flex items-center justify-between border border-border rounded-[12px] p-3">
              <div>
                <p className="font-medium">{hp.title}</p>
                <p className="text-xs text-muted">{hp.seller_name} · {hp.city}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => restore(hp.id)} className="bg-primary text-white px-3 py-1 rounded-lg text-xs">{t("content.home_products.restore")}</button>
                <button onClick={() => remove(hp.id)} className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs">{t("content.home_products.delete")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
