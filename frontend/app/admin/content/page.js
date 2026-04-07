"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function AdminContentPage() {
  const [section, setSection] = useState("categories");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">תוכן</h1>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: "categories", label: "קטגוריות" },
          { id: "home_products", label: "מוצרים ביתיים" },
          { id: "about", label: "עמוד חזון" },
          { id: "terms", label: "תנאי שימוש" },
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
    if (!confirm("למחוק קטגוריה?")) return;
    await api.delete(`/admin/categories/${id}`);
    load();
  };

  return (
    <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
      <form onSubmit={create} className="flex gap-2">
        <input
          placeholder="אימוג׳י"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-2 w-20 text-center"
        />
        <input
          placeholder="שם קטגוריה"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 border border-border rounded-[12px] px-3 py-2"
        />
        <button type="submit" className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm">
          + הוסף
        </button>
      </form>

      <ul className="space-y-2">
        {items.map((c) => (
          <CategoryRow key={c.id} cat={c} onSave={update} onDelete={remove} />
        ))}
      </ul>
    </div>
  );
}

function CategoryRow({ cat, onSave, onDelete }) {
  const [name, setName] = useState(cat.name);
  const [emoji, setEmoji] = useState(cat.emoji || "");
  const dirty = name !== cat.name || emoji !== (cat.emoji || "");

  return (
    <li className="flex gap-2 items-center border border-border rounded-[12px] p-2">
      <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="border border-border rounded px-2 py-1 w-16 text-center" />
      <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-border rounded px-2 py-1" />
      <button
        onClick={() => onSave(cat.id, name, emoji)}
        disabled={!dirty}
        className="text-xs bg-secondary text-white px-3 py-1 rounded disabled:opacity-30"
      >
        שמור
      </button>
      <button onClick={() => onDelete(cat.id)} className="text-xs text-red-600">מחק</button>
    </li>
  );
}

function HiddenHomeProducts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/admin/home-products/hidden").then((r) => setItems(r.data)).catch(() => setItems([]));
  }, []);

  const restore = async (id) => {
    await api.post(`/admin/home-products/${id}/restore`);
    setItems(items.filter((i) => i.id !== id));
  };
  const remove = async (id) => {
    if (!confirm("למחוק את המוצר?")) return;
    await api.delete(`/admin/home-products/${id}`);
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="bg-white border border-border rounded-[12px] p-5">
      <h2 className="font-semibold mb-3">מוצרים ביתיים מוסתרים</h2>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">אין מוצרים מוסתרים 🎉</p>
      ) : (
        <ul className="space-y-2">
          {items.map((hp) => (
            <li key={hp.id} className="flex items-center justify-between border border-border rounded-[12px] p-3">
              <div>
                <p className="font-medium">{hp.title}</p>
                <p className="text-xs text-text-secondary">{hp.seller_name} · {hp.city}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => restore(hp.id)} className="bg-primary text-white px-3 py-1 rounded text-xs">שחזר</button>
                <button onClick={() => remove(hp.id)} className="bg-red-500 text-white px-3 py-1 rounded text-xs">מחק</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PageEditor({ slug }) {
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
        placeholder="כותרת"
        className="w-full border border-border rounded-[12px] px-3 py-2 font-semibold"
      />
      <textarea
        value={page.body}
        onChange={(e) => { setPage({ ...page, body: e.target.value }); setSaved(false); }}
        placeholder="תוכן (Markdown נתמך)"
        rows={16}
        className="w-full border border-border rounded-[12px] px-3 py-2 font-mono text-sm"
      />
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm disabled:opacity-50">
          {saving ? "שומר..." : "שמור"}
        </button>
        {saved && <span className="text-sm text-primary">נשמר ✓</span>}
      </div>
    </div>
  );
}
