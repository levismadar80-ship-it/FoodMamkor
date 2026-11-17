// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import Input from "@/components/ui/Input";

/**
 * Module:   PublishWithConsentPanel
 * Purpose:  «פרסום בהסכמה» on a DRAFT business's edit page (MEH-3377): the
 *           business said yes in writing, so the admin records where and when
 *           and the page goes live.
 * Touches:  POST /admin/producers/{id}/publish-with-consent
 *           (backend producer_draft_preview.py).
 * Does NOT: decide whether the draft may be published — the server does
 *           (ownerless draft, a photo, a licence number or the explicit box),
 *           and its refusals are shown verbatim. Does NOT message the
 *           business; the admin sends the live link herself.
 * Related:  components/admin/OwnerInvitePanel.jsx — it replaces this panel
 *           the moment the page is live, with the consent note carried over.
 *
 * States: idle (button disabled until the note and the consent box are
 * filled) → busy → gone (`onPublished` re-fetches; the page is no longer a
 * draft, so the edit page stops rendering this panel) | error (server detail).
 */
export default function PublishWithConsentPanel({ producerId, onPublished }) {
  const t = useTranslations("admin.producers.consent_publish");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [withoutLicense, setWithoutLicense] = useState(false);
  // Optional proof: a screenshot of the written consent. Uploaded on pick, so
  // the publish request carries a URL and stays a small JSON body.
  const [shotUrl, setShotUrl] = useState(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotError, setShotError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // An upload in flight blocks submit: publishing mid-upload would drop the
  // screenshot the admin believes she attached.
  const canSubmit = note.trim() && consent && !busy && !shotBusy;

  const pickShot = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setShotBusy(true);
    setShotError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setShotUrl(r.data.url);
    } catch (err) {
      setShotError(detailToMessage(err?.response?.data?.detail) || t("screenshot_error"));
    } finally {
      setShotBusy(false);
    }
  };

  const publish = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/admin/producers/${producerId}/publish-with-consent`,
        {
          consent_confirmed: true,
          consent_note: note.trim(),
          ...(shotUrl ? { consent_screenshot_url: shotUrl } : {}),
        },
        // Sent only when ticked, so the server's default (guard on) holds.
        withoutLicense ? { params: { allow_without_license: true } } : undefined,
      );
      onPublished?.();
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("error"));
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="consent-publish-panel"
      className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl"
    >
      <h2 className="font-semibold text-lg mb-2 text-primary">{t("title")}</h2>
      <p className="text-sm text-muted mb-4">{t("intro")}</p>

      <form onSubmit={publish} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm text-muted mb-1" htmlFor="consent-publish-note">
            {t("note_label")}
          </label>
          <Input inline size="sm"
            id="consent-publish-note"
            data-testid="consent-publish-note"
            placeholder={t("note_placeholder")}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full min-h-touch"
          />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1" htmlFor="consent-publish-screenshot">
            {t("screenshot_label")}
          </label>
          {shotUrl ? (
            <div className="flex items-center gap-3 text-sm" data-testid="consent-publish-screenshot-attached">
              <a href={shotUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">
                {t("screenshot_attached")}
              </a>
              <Button
                type="button"
                data-testid="consent-publish-screenshot-remove"
                onClick={() => setShotUrl(null)}
                variant="secondary" size="sm"
              >
                {t("screenshot_remove")}
              </Button>
            </div>
          ) : (
            <input
              id="consent-publish-screenshot"
              data-testid="consent-publish-screenshot"
              type="file"
              accept="image/*"
              disabled={shotBusy || busy}
              onChange={pickShot}
              className="block w-full text-sm min-h-touch"
            />
          )}
          {shotBusy && <p className="text-sm text-muted mt-1">{t("screenshot_uploading")}</p>}
          {shotError && (
            <InlineMessage data-testid="consent-publish-screenshot-error">{shotError}</InlineMessage>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            data-testid="consent-publish-consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
          />
          <span className="leading-relaxed text-text">{t("consent")}</span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            data-testid="consent-publish-without-license"
            checked={withoutLicense}
            onChange={(e) => setWithoutLicense(e.target.checked)}
            className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
          />
          <span className="leading-relaxed text-text">{t("without_license")}</span>
        </label>

        {error && (
          <InlineMessage data-testid="consent-publish-error">{error}</InlineMessage>
        )}

        <div>
          <Button
            type="submit"
            data-testid="consent-publish-submit"
            disabled={!canSubmit}
            variant="primary" size="sm"
          >
            {busy ? t("publishing") : t("submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
