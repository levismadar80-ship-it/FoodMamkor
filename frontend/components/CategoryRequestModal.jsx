"use client";

import { useEffect, useState } from "react";
import { useFocusReturn } from "@/lib/use-focus-return";
import { showToast } from "@/lib/toast";
import api from "@/lib/api";

export default function CategoryRequestModal({ open, onClose, producerId }) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.post("/category-requests", {
        requested_name: name.trim(),
        examples: examples.trim() || null,
        producer_id: producerId || null,
      });
      showToast("תודה! הבקשה התקבלה. בינתיים, בחרי את הקטגוריה הקרובה ביותר.", "success", 4000);
      setName("");
      setExamples("");
      onClose();
    } catch {
      showToast("שגיאה בשליחת הבקשה — נסי שוב", "error");
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
        <h2 id="cat-req-title" className="font-headline text-lg font-bold text-site-text mb-4">
          איזו קטגוריה חסרה?
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הקטגוריה המוצעת *"
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-right"
              dir="rtl"
            />
            <p className="text-xs text-site-muted mt-1">לדוגמה: משקאות מותססים</p>
          </div>

          <div>
            <textarea
              maxLength={300}
              rows={3}
              value={examples}
              onChange={(e) => setExamples(e.target.value)}
              placeholder="דוגמאות למוצרים (אופציונלי)"
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-right resize-none"
              dir="rtl"
            />
            <p className="text-xs text-site-muted mt-1">{'קומבוצ\'ה, קפיר, וואטר קפיר...'}</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 bg-primary text-white py-2 rounded-[12px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50"
            >
              {loading ? "שולחת..." : "שלחי בקשה"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[12px] text-sm text-site-muted hover:text-site-text border transition"
            >
              סגרי
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
