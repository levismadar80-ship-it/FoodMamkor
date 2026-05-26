"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFocusReturn } from "@/lib/use-focus-return";
import { showToast } from "@/lib/toast";
import api from "@/lib/api";

function countLetters(s) {
  return (s.match(/[א-תa-zA-Z]/g) || []).length;
}

export default function CategoryRequestModal({ open, onClose, producerId }) {
  const t = useTranslations("modals.category_request");
  const [name, setName] = useState("");
  const [examples, setExamples] = useState("");
  const [loading, setLoading] = useState(false);

  useFocusReturn(open);

  // WCAG 2.1 §2.1.2 — Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasEnoughLetters = countLetters(name) >= 3;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasEnoughLetters) return;
    setLoading(true);
    try {
      await api.post("/category-requests", {
        requested_name: name.trim(),
        examples: examples.trim() || null,
        producer_id: producerId || null,
      });
      showToast(t("toasts.success"), "success", 4000);
      setName("");
      setExamples("");
      onClose();
    } catch {
      showToast(t("toasts.error"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cat-req-title"
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-[16px] shadow-xl w-full max-w-sm p-6 text-right" dir="rtl">
        <h2 id="cat-req-title" className="font-headline text-lg font-bold text-text mb-4">
          {t("title")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("name_placeholder")}
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-right"
              dir="rtl"
            />
            <p className="text-xs text-fg-muted mt-1">{t("name_example")}</p>
          </div>

          <div>
            <textarea
              maxLength={300}
              rows={3}
              value={examples}
              onChange={(e) => setExamples(e.target.value)}
              placeholder={t("examples_placeholder")}
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-right resize-none"
              dir="rtl"
            />
            <p className="text-xs text-fg-muted mt-1">{t("examples_hint")}</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !hasEnoughLetters}
              className="flex-1 bg-primary text-white py-2 rounded-[12px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50"
            >
              {loading ? t("submit_loading") : t("submit")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[12px] text-sm text-fg-muted hover:text-text border transition"
            >
              {t("close")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
