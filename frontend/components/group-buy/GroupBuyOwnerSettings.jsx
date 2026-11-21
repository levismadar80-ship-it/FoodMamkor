// @ts-check
"use client";

/**
 * MEH-3592: on the owner's group-buy card — change the caps (never below what
 * already joined, the server refuses that) and stop / reopen joins. Eventbrite
 * and Shopify let a seller change capacity and pause sales mid-run; before
 * this, the only way to stop a group taking orders was to cancel it.
 * Collapsed by default: a weekly-at-most tool on a daily screen.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

/** @param {number | string | null | undefined} v */
const toField = (v) => (v == null ? "" : String(v));
/** @param {string} v */
const toCap = (v) => (String(v).trim() === "" ? null : Math.max(1, Math.floor(Number(v)) || 1));

/** @param {{ gb: any, onSaved: () => Promise<void> | void }} props */
export default function GroupBuyOwnerSettings({ gb, onSaved }) {
  const t = useTranslations("group_buys.dashboard.settings");
  const [open, setOpen] = useState(false);
  const [maxPeople, setMaxPeople] = useState(toField(gb.max_participants));
  const [maxUnits, setMaxUnits] = useState(toField(gb.max_units));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (/** @type {Record<string, unknown>} */ body) => {
    setError("");
    setBusy(true);
    try {
      await api.patch(`/group-buys/${gb.id}/settings`, body);
      showToast.success(t("saved"));
      await onSaved();
    } catch (error_) {
      setError(detailToMessage(error_.response?.data?.detail) || t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border" data-testid="group-buy-owner-settings">
      {gb.joins_closed && (
        <p className="mb-2 text-sm text-fg-muted" data-testid="group-buy-joins-closed-owner">{t("closed_note")}</p>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-primary hover:underline"
        data-testid="group-buy-settings-toggle"
      >
        {t("toggle")}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("max_people")} type="number" min={1} value={maxPeople} onChange={(e) => setMaxPeople(e.target.value)} placeholder={t("no_cap")} dir="ltr" />
            <Input label={t("max_units")} type="number" min={1} value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} placeholder={t("no_cap")} dir="ltr" />
          </div>
          <p className="text-xs text-fg-muted">{t("caps_hint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" disabled={busy} onClick={() => send({ max_participants: toCap(maxPeople), max_units: toCap(maxUnits) })} data-testid="group-buy-settings-save">
              {t("save")}
            </Button>
            <Button variant="outlined" size="md" disabled={busy} onClick={() => send({ joins_open: Boolean(gb.joins_closed) })} data-testid="group-buy-joins-switch">
              {gb.joins_closed ? t("reopen") : t("stop")}
            </Button>
          </div>
          {error && <InlineMessage>{error}</InlineMessage>}
        </div>
      )}
    </div>
  );
}
