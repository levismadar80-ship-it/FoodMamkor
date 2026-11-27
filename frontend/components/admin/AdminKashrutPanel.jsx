// @ts-check
"use client";

/**
 * Module:   AdminKashrutPanel
 * Purpose:  Attach a kashrut certificate the business sent the admin and turn
 *           its badge on, from the business's admin edit page. For businesses
 *           with no owner account, which cannot file the request themselves.
 * Touches:  POST /upload/kashrut-cert (the photo) ·
 *           POST /admin/producers/{id}/kashrut {badge_code, cert_url, expires_on}.
 * Does NOT: approve or revoke an owner's request — that is /admin/kashrut; or
 *           decide the expiry rule — services/kashrut_grant.py.
 * Related:  app/[locale]/producer/dashboard/edit/cards/KashrutCard.jsx (the
 *           owner's side of the same upload) · AdminVerifiedPanel.jsx (shape).
 * History:  MEH-3081 (creation): 19 businesses wrote «כשר» in their about text,
 *           18 had no account, and no screen could attach their certificate.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SealCheck } from "@phosphor-icons/react";
import api from "@/lib/api";
import { KashrutGrantSchema } from "@/lib/api-responses";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import KashrutBadgeStrip, { CODE_TO_KEY } from "@/components/KashrutBadgeStrip";
import { isKashrutCurrent } from "@/lib/badges";


const CODES = Object.keys(CODE_TO_KEY);

/**
 * @param {{
 *   producerId: string,
 *   kind?: string,
 *   badges?: string[] | null,
 *   verifiedAt?: string | null,
 *   expiresAt?: string | null,
 * }} props
 */
export default function AdminKashrutPanel({ producerId, kind = "producer", badges = [], verifiedAt = null, expiresAt = null }) {
  const t = useTranslations("admin.producers.kashrut_grant");
  const tBadges = useTranslations("kashrut.badges");
  // The owner card's strings, where the words are the same (messages-hygiene).
  const tOwner = useTranslations("dashboard.producer.kashrut");
  const [state, setState] = useState({ badges: badges || [], verifiedAt, expiresAt });
  const form = useGrantForm(producerId, t, tOwner, setState);
  // ADR-036: an organizer's certificate is never served publicly; the server
  // answers 409, so the panel is not offered at all.
  if (kind === "organizer") return null;
  // An expired badge is not shown on the page either, so it reads as «none»
  // here — renewal is the likeliest reason to open this panel.
  const current =
    state.badges.length > 0 &&
    isKashrutCurrent({ kashrut_verified_at: state.verifiedAt, kashrut_expires_at: state.expiresAt });

  return (
    <section data-testid="kashrut-grant-panel" className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl">
      <h2 className="font-semibold text-lg mb-2 text-primary flex items-center gap-2">
        <SealCheck size={20} aria-hidden="true" /> {tOwner("heading")}
      </h2>
      <p className="text-sm text-muted mb-4">{t("intro")}</p>
      {current ? (
        <KashrutBadgeStrip badges={state.badges} verified_at={state.verifiedAt} expires_at={state.expiresAt} />
      ) : (
        <p className="text-sm mb-4" data-testid="kashrut-grant-none">{t("none")}</p>
      )}
      <GrantForm form={form} t={t} tOwner={tOwner} tBadges={tBadges} />
    </section>
  );
}

/**
 * @param {string} producerId
  * @param {(k: string) => string} t
 * @param {(k: string) => string} tOwner
 * @param {(fn: (s: any) => any) => void} setState
 */
function useGrantForm(producerId, t, tOwner, setState) {
  const [code, setCode] = useState("");
  const [certUrl, setCertUrl] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [done, setDone] = useState(false);

  const upload = async (/** @type {any} */ e) => {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/kashrut-cert", fd);
      setCertUrl(r.data.url);
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || tOwner("upload_error"));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const r = await api.post(`/admin/producers/${producerId}/kashrut`, {
        badge_code: code,
        cert_url: certUrl,
        expires_on: expiresOn,
      });
      const granted = KashrutGrantSchema.safeParse(r.data); // rule 19
      if (!granted.success) throw new Error("unexpected grant response");
      setState(await readBack(producerId, granted.data.badge_code));
      setCode("");
      setCertUrl("");
      setExpiresOn("");
      setDone(true);
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("error"));
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(code && certUrl && expiresOn) && !busy;
  return { code, setCode, certUrl, expiresOn, setExpiresOn, busy, error, done, upload, submit, ready };
}

/**
 * @param {{ form: ReturnType<typeof useGrantForm>, t: (k: string) => string, tOwner: (k: string) => string, tBadges: (k: string) => string }} props
 */
function GrantForm({ form, t, tOwner, tBadges }) {
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <Select
        label={t("badge_label")}
        value={form.code}
        onChange={(e) => form.setCode(e.target.value)}
        data-testid="kashrut-grant-code"
        className="sm:w-64"
        disabled={form.busy}
      >
        <option value="">{tOwner("select_placeholder")}</option>
        {CODES.map((c) => (
          <option key={c} value={c}>{tBadges(`${CODE_TO_KEY[c]}.label`)}</option>
        ))}
      </Select>
      <CertUpload form={form} t={t} tOwner={tOwner} />
      <Input
        type="date"
        label={t("expires_label")}
        value={form.expiresOn}
        onChange={(e) => form.setExpiresOn(e.target.value)}
        data-testid="kashrut-grant-expires"
        className="sm:w-64"
        disabled={form.busy}
      />
      <Button type="button" variant="primary" size="sm" onClick={form.submit} disabled={!form.ready} data-testid="kashrut-grant-submit">
        {form.busy ? tOwner("submitting") : t("submit")}
      </Button>
      {form.done && <InlineMessage tone="success" data-testid="kashrut-grant-done">{t("done")}</InlineMessage>}
      {form.error && <InlineMessage data-testid="kashrut-grant-error">{form.error}</InlineMessage>}
    </div>
  );
}

/**
 * The server's state after a grant: the expiry may be an earlier live badge's.
 * Its own try — a failed re-read after a 201 must not read as a failed grant
 * (a retry would write a second approved row).
 * @param {string} producerId
 * @param {string} code
 */
async function readBack(producerId, code) {
  try {
    const res = await api.get(`/admin/producers/${producerId}`);
    const p = res.data || {};
    return () => ({ badges: p.kashrut_badges || [code], verifiedAt: p.kashrut_verified_at, expiresAt: p.kashrut_expires_at });
  } catch {
    return (/** @type {any} */ s) => ({ ...s, badges: [...new Set([...s.badges, code])], verifiedAt: new Date().toISOString() });
  }
}

/** @param {{ form: ReturnType<typeof useGrantForm>, t: (k: string) => string, tOwner: (k: string) => string }} props */
function CertUpload({ form, t, tOwner }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium block">{t("cert_label")}</span>
      <div className="flex items-center gap-3">
        {form.certUrl && (
          /* raw img: an admin-only preview of the photo she just uploaded. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={form.certUrl} alt={t("cert_label")} className="w-16 h-16 rounded-sm object-cover border border-border" />
        )}
        <label className="inline-flex items-center gap-2 text-sm font-medium text-primary cursor-pointer">
          <input type="file" accept="image/*" className="sr-only" onChange={form.upload} disabled={form.busy} data-testid="kashrut-grant-file" />
          <span aria-live="polite">{form.certUrl ? tOwner("upload_replace_cta") : tOwner("upload_cta")}</span>
        </label>
      </div>
    </div>
  );
}
