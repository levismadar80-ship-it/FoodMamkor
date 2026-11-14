"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { showToast } from "@/lib/toast";
import api from "@/lib/api";
import CollectionNotice from "@/components/CollectionNotice";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Dialog from "@/components/ui/Dialog";

function countLetters(s) {
  return (s.match(/[א-תa-zA-Z]/g) || []).length;
}

export default function CategoryRequestModal({ open, onClose, producerId }) {
  const t = useTranslations("modals.category_request");
  // MEH-1981: notice-at-collection (copy approved verbatim 02/09, rule 22).
  const tNotice = useTranslations("privacy.collection_notice");
  const tPrivacyLink = useTranslations("auth.register.consumer.terms");
  const [name, setName] = useState("");
  const [examples, setExamples] = useState("");
  const [loading, setLoading] = useState(false);

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
    <Dialog labelledBy="cat-req-title" size="sm" onClose={onClose}>
        <h2 id="cat-req-title" className="font-headline-md text-lg font-bold text-text mb-4">
          {t("title")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            size="sm"
            type="text"
            autoFocus
            data-autofocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("name_placeholder")}
            helperText={t("name_example")}
            className="text-start"
          />

          <Textarea
            maxLength={300}
            rows={3}
            value={examples}
            onChange={(e) => setExamples(e.target.value)}
            placeholder={t("examples_placeholder")}
            helperText={t("examples_hint")}
            className="text-start resize-none"
          />

          <CollectionNotice
            message={tNotice("category_request")}
            linkLabel={tPrivacyLink("privacy_link")}
            testId="category-request-collection-notice"
          />

          <div className="flex gap-3 pt-1">
            <Button
              type="submit"
              disabled={loading || !hasEnoughLetters}
              variant="primary" size="sm" className="flex-1"
            >
              {loading ? t("submit_loading") : t("submit")}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm text-fg-muted hover:text-text border transition"
            >
              {t("close")}
            </button>
          </div>
        </form>
    </Dialog>
  );
}
