"use client";

import { useEffect, useRef, useState } from "react";
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

  // MEH-2039: trap scopes to the PANEL, never the fixed inset-0 overlay.
  const panelRef = useRef(null);

  useFocusReturn(open);

  // WCAG 2.1 §2.1.2 — Escape closes the dialog.
  // MEH-2039: + Tab trap and body scroll lock. No initial-focus call — the name
  // input already carries autoFocus below, and a second focus call would fight it.
  // REUSES: LoginPromptModal.jsx:42-77.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;

      const focusables = panelRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
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
      showToast.success(t("toasts.success"), { duration: 4000 });
      setName("");
      setExamples("");
      onClose();
    } catch {
      showToast.error(t("toasts.error"));
    } finally {
      setLoading(false);
    }
  };

  // MEH-2039: role="dialog" + aria-modal moved off the full-screen overlay onto
  // the inner panel — with the role on the overlay, the whole page sat inside the
  // dialog boundary. Backdrop click-to-close is unchanged; the
  // `e.target === e.currentTarget` guard still separates backdrop from panel.
  // REUSES: LoginPromptModal.jsx:87 for the role="presentation" wrapper.
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-req-title"
        className="bg-white rounded-[16px] shadow-xl w-full max-w-sm p-6 text-start"
      >
        <h2 id="cat-req-title" className="font-headline-md text-lg font-bold text-text mb-4">
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
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-start"
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
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-start resize-none"
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
