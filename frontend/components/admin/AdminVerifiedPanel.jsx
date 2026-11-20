// @ts-check
"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SealCheck } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format-date";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import InlineMessage from "@/components/ui/InlineMessage";

/**
 * Module:   AdminVerifiedPanel
 * Purpose:  Give or remove a business's «מאומת» badge from its admin edit
 *           page, after the admin has checked the qualifying document.
 * Touches:  POST /admin/producers/{id}/grant-verified {doc_type} ·
 *           POST /admin/producers/{id}/revoke-verified (admin_decisions.py).
 * Does NOT: decide who may get the badge — the server does (an organizer is a
 *           409, shown here verbatim); or show the document itself — that is
 *           ReviewEvidence.jsx in the review queue.
 * Related:  backend/app/schemas/admin_review.py GrantVerifiedIn (the three
 *           doc types) · components/admin/ProducerForm.jsx:974 (where the old
 *           free checkbox was removed, MEH-766 ch3).
 * History:  MEH-3524 (creation). Since MEH-766 the grant route was the ONLY way
 *           to set verified_at, and nothing in the site called it — found by
 *           the unwired-route guard (MEH-3523).
 */

const DOC_TYPES = ["license", "exemption", "cosmetics"];

/**
 * @param {{
 *   producerId: string,
 *   kind?: string,
 *   verifiedAt?: string | null,
 *   docType?: string | null,
 * }} props
 */
export default function AdminVerifiedPanel({ producerId, kind = "producer", verifiedAt = null, docType = null }) {
  const t = useTranslations("admin.producers.verified");
  const locale = useLocale();
  const [state, setState] = useState({ at: verifiedAt, doc: docType });
  const [choice, setChoice] = useState(docType || "license");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [done, setDone] = useState(/** @type {string | null} */ (null));

  if (kind === "organizer") {
    return (
      <Shell t={t}>
        <p className="text-sm text-muted" data-testid="verified-organizer">{t("organizer")}</p>
      </Shell>
    );
  }

  const run = async (/** @type {() => Promise<any>} */ call, /** @type {(data: any) => void} */ after, /** @type {string} */ doneKey) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await call();
      after(res?.data);
      setDone(t(doneKey));
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("error"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const grant = () =>
    run(
      () => api.post(`/admin/producers/${producerId}/grant-verified`, { doc_type: choice }),
      // The server's stamp, not this browser's clock.
      (data) => setState({ at: data?.verified_at || new Date().toISOString(), doc: data?.verification_doc_type || choice }),
      "done_granted",
    );
  const revoke = () =>
    run(
      () => api.post(`/admin/producers/${producerId}/revoke-verified`),
      () => setState({ at: null, doc: null }),
      "done_revoked",
    );

  const on = !!state.at;
  return (
    <Shell t={t}>
      <p className="text-sm mb-4" data-testid={on ? "verified-state-on" : "verified-state-off"}>
        {on
          ? t("state_on", { date: formatDate(state.at, locale), doc: t(`doc_${state.doc || "license"}`) })
          : t("state_off")}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <Select
          label={t("doc_label")}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          data-testid="verified-doc"
          className="sm:w-64"
          disabled={busy}
        >
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>{t(`doc_${d}`)}</option>
          ))}
        </Select>
        <Button type="button" variant="primary" size="sm" onClick={grant} disabled={busy} data-testid="verified-grant">
          {busy && !confirming ? t("saving") : on ? t("regrant") : t("grant")}
        </Button>
        {on && !confirming && (
          <Button type="button" variant="outlined" size="sm" onClick={() => setConfirming(true)} disabled={busy} data-testid="verified-revoke">
            {t("revoke")}
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-4" data-testid="verified-confirm">
          <p className="text-sm mb-2">{t("confirm_revoke")}</p>
          <div className="flex gap-2">
            <Button type="button" variant="danger" size="sm" onClick={revoke} disabled={busy} data-testid="verified-revoke-yes">
              {t("confirm_yes")}
            </Button>
            <Button type="button" variant="outlined" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
              {t("confirm_no")}
            </Button>
          </div>
        </div>
      )}

      {done && (
        <InlineMessage tone="success" className="mt-4" data-testid="verified-done">{done}</InlineMessage>
      )}
      {error && (
        <InlineMessage className="mt-4" data-testid="verified-error">{error}</InlineMessage>
      )}
    </Shell>
  );
}

/** @param {{ t: (k: string) => string, children: import("react").ReactNode }} props */
function Shell({ t, children }) {
  return (
    <section data-testid="verified-panel" className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl">
      <h2 className="font-semibold text-lg mb-2 text-primary flex items-center gap-2">
        <SealCheck size={20} aria-hidden="true" /> {t("title")}
      </h2>
      <p className="text-sm text-muted mb-4">{t("intro")}</p>
      {children}
    </section>
  );
}
