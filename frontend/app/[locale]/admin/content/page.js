"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
// MEH-1176 F4: this was the last audited admin page NOT riding the MEH-228
// double-submit hook — create/update/delete/page-save all lacked an
// in-flight lock (and create/update/page-save swallowed errors silently).
import { useAdminAction } from "@/lib/use-admin-action";

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
  const { run, isBusy } = useAdminAction();
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  // MEH-1023 Chunk B: replaces the native browser confirm with a modal dialog showing
  // the category name. { id, name } while a delete is pending; null otherwise.
  const [confirmDelete, setConfirmDelete] = useState(null);
  // MEH-1176 F4: the ad-hoc `deleting` state became the hook's per-key busy
  // flag — same UI contract (disabled buttons, Escape gate, dialog stays
  // open on failure), plus a genuine synchronous double-fire lock.
  const deleting = confirmDelete ? isBusy(`category-delete-${confirmDelete.id}`) : false;

  useEffect(() => { load(); }, []);
  const load = () => api.get("/admin/categories").then((r) => setItems(r.data));

  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run("category-create", async () => {
      await api.post("/admin/categories", { name });
      setName("");
      load();
    });
  };
  const update = (id, newName) =>
    run(`category-save-${id}`, async () => {
      await api.put(`/admin/categories/${id}`, { name: newName });
      load();
    });
  // Open the confirm dialog; the DELETE call only fires from confirmRemove.
  // MEH-1034: carry producer_count so the dialog can show the blast radius.
  const remove = (cat) =>
    setConfirmDelete({ id: cat.id, name: cat.name, producer_count: cat.producer_count ?? 0 });
  const confirmRemove = () =>
    run(
      `category-delete-${confirmDelete.id}`,
      async () => {
        await api.delete(`/admin/categories/${confirmDelete.id}`);
        load();
        setConfirmDelete(null); // close only on success
      },
      // Keep the dialog open on failure so the admin can retry or cancel.
      () => showToast.error(t("content.categories.delete_error")),
    );

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
        <button
          type="submit"
          disabled={isBusy("category-create")}
          className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm disabled:opacity-50"
        >
          {t("content.categories.add")}
        </button>
      </form>

      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-muted text-center py-4">{t("content.categories.empty")}</li>
        ) : (
          items.map((c) => (
            <CategoryRow
              key={c.id}
              cat={c}
              onSave={update}
              onDelete={remove}
              saving={isBusy(`category-save-${c.id}`)}
            />
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
            className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full mx-4 text-start space-y-4"
          >
            <p id="category-delete-title" className="font-medium text-base">
              {t("content.categories.confirm_delete", {
                name: confirmDelete.name,
                count: confirmDelete.producer_count,
              })}
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

function CategoryRow({ cat, onSave, onDelete, saving }) {
  const t = useTranslations("admin");
  const [name, setName] = useState(cat.name);
  const dirty = name !== cat.name;

  return (
    <li className="flex gap-2 items-center border border-border rounded-[12px] p-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-border rounded-lg px-2 py-1" />
      {/* MEH-1034: per-row producer count (the editor is a list, not a table). */}
      <span className="text-xs text-muted whitespace-nowrap">
        {t("content.categories.producer_count", { count: cat.producer_count ?? 0 })}
      </span>
      <button
        onClick={() => onSave(cat.id, name)}
        disabled={!dirty || saving}
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
  const { run, isBusy } = useAdminAction();
  const [page, setPage] = useState({ title: "", body: "" });
  const [saved, setSaved] = useState(false);
  // MEH-1176 F4: hook-keyed busy state — the old try/finally had no catch,
  // so a failed save was silent; run() now surfaces the central error toast.
  const saving = isBusy(`page-save-${slug}`);

  useEffect(() => {
    setSaved(false);
    api.get(`/admin/pages/${slug}`).then((r) => setPage(r.data));
  }, [slug]);

  const save = () =>
    run(`page-save-${slug}`, async () => {
      await api.put(`/admin/pages/${slug}`, { title: page.title, body: page.body });
      setSaved(true);
    });

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
