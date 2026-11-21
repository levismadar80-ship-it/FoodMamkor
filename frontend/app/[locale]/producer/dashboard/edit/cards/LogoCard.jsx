"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/LogoCard
 * Purpose:  The business's logo (MEH-3611): upload, replace, remove. It shows
 *           beside the business name on the business page and the bag page.
 * Touches:  POST /upload/image (the uploader's own Cloudinary folder), then
 *           PUT /producers/me { logo_url } — saved on upload, no Save click
 *           (the ImagesCard MEH-1236 "upload ≠ save" lesson).
 * Does NOT: count toward the gallery cap — the cap lives in PUT /producers/me
 *           and reads `images` only (services/gallery_cap.py).
 * History:  MEH-3611 (creation)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import InlineMessage from "@/components/ui/InlineMessage";

/** @param {{ profile: any, onSave: (patch: object) => void }} props */
export function LogoCard({ profile, onSave }) {
  const t = useTranslations("dashboard.producer.logo");
  const [logoUrl, setLogoUrl] = useState(profile.logo_url || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const persist = async (next) => {
    await api.put("/producers/me", { logo_url: next });
    setLogoUrl(next || "");
    onSave({ logo_url: next });
  };

  const upload = async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      let url;
      try {
        url = (await api.post("/upload/image", fd)).data.url;
      } catch (error_) {
        setError(detailToMessage(error_?.response?.data?.detail) || t("upload_error"));
        return;
      }
      await persist(url);
    } catch (error_) {
      setError(detailToMessage(error_?.response?.data?.detail) || t("save_error"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError("");
    setBusy(true);
    try {
      await persist(null);
    } catch (error_) {
      setError(detailToMessage(error_?.response?.data?.detail) || t("save_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5 pb-4 mb-4 border-b border-border" data-testid="logo-card">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{t("label")}</span>
        <span className="text-2xs text-fg-muted">{t("where")}</span>
      </div>
      <div className="flex items-center gap-3">
        {logoUrl ? (
          /* raw img: an owner-uploaded preview that may be the local
             /placeholder-image.png fallback; authenticated chrome, 64px. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt={t("label")}
            className="w-16 h-16 rounded-full object-contain bg-surface border border-border"
            data-testid="logo-preview"
          />
        ) : (
          <span className="w-16 h-16 rounded-full bg-primary/10 border border-border" aria-hidden="true" />
        )}
        <div className="flex flex-col items-start gap-1">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark cursor-pointer transition">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={upload}
              disabled={busy}
              data-testid="logo-input"
            />
            <span aria-live="polite">{busy ? t("uploading") : logoUrl ? t("replace_cta") : t("cta")}</span>
          </label>
          {logoUrl && !busy && (
            <button
              type="button"
              onClick={remove}
              className="text-xs text-fg-muted hover:text-text underline"
              data-testid="logo-remove"
            >
              {t("remove_cta")}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-fg-muted">{t("hint")}</p>
      {error && (
        <InlineMessage size="xs" className="flex items-start gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
          {error}
        </InlineMessage>
      )}
    </div>
  );
}
