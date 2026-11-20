// @ts-check
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Wine } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Switch from "@/components/ui/Switch";
import InlineMessage from "@/components/ui/InlineMessage";

/**
 * Module:   AdminAlcoholPanel
 * Purpose:  Let the admin mark a business as licensed to sell alcohol, from
 *           its admin edit page. Without the mark no customer can order a
 *           product that contains alcohol from it (Sapir 14/11).
 * Touches:  GET /admin/producers/{id}/order-settings ·
 *           PUT /admin/producers/{id}/order-settings/alcohol (product_orders.py).
 * Does NOT: switch ordering on — that stays the owner's own choice
 *           (OrderSettingsCard.jsx); or show anything while on-site ordering
 *           is off (both routes answer 404 then, and the panel renders nothing).
 * History:  MEH-3524 (creation). The PUT had no caller since MEH-3218 — found
 *           by the unwired-route guard (MEH-3523).
 */

/** @param {{ producerId: string }} props */
export default function AdminAlcoholPanel({ producerId }) {
  const t = useTranslations("admin.producers.alcohol");
  const [on, setOn] = useState(/** @type {boolean | null} */ (null));
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get(`/admin/producers/${producerId}/order-settings`)
      .then((r) => live && setOn(!!r.data?.alcohol_licensed))
      .catch((err) => {
        if (!live) return;
        if (err?.response?.status === 404) setHidden(true);
        else setError(t("load_error"));
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is read only on failure; refetching when it changes identity would repeat the GET
  }, [producerId]);

  if (hidden) return null;

  const toggle = async () => {
    const next = !on;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api.put(`/admin/producers/${producerId}/order-settings/alcohol`, { alcohol_licensed: next });
      setOn(!!r.data?.alcohol_licensed);
      setSaved(true);
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="alcohol-panel" className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl">
      <h2 className="font-semibold text-lg mb-2 text-primary flex items-center gap-2">
        <Wine size={20} aria-hidden="true" /> {t("title")}
      </h2>
      <p className="text-sm text-muted mb-4">{t("intro")}</p>
      {on !== null && (
        <div className="flex items-center gap-3">
          <Switch
            checked={on}
            onClick={toggle}
            disabled={busy}
            aria-labelledby="alcohol-label"
            data-testid="alcohol-switch"
          />
          <span id="alcohol-label" className="text-sm">{t("label")}</span>
        </div>
      )}
      {saved && <InlineMessage tone="success" className="mt-3" data-testid="alcohol-saved">{t("saved")}</InlineMessage>}
      {error && <InlineMessage className="mt-3" data-testid="alcohol-error">{error}</InlineMessage>}
    </section>
  );
}
