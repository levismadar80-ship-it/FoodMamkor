// @ts-check
"use client";

/**
 * Module:   PaymentInfoEditor
 * Purpose:  «איך משלמים לך?» — the owner picks how customers pay (five tiles
 *           with icons + a «בחירת הכל» switch), when they pay (one of three,
 *           clearable), and one optional line. Saves producers.payment_info.
 * Does NOT: render the public answer — that is the «איך משלמים?» chip on the
 *           business page (MEH-3035 chunk 3). Does not take or process money:
 *           the site only says how the business itself takes payment.
 * Related:  lib/payment-info.js (lists + serializer), OrderWindowEditor.jsx
 *           (the save / dirty / revert pattern this follows),
 *           backend/app/routers/producer_me.py (PUT /producers/me).
 * History:  MEH-3035 chunk 2 (design v3 option א, Sapir 13/11).
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  DeviceMobile,
  Bank,
  Money,
  CreditCard,
  Check,
  CheckCircle,
  Warning,
} from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import {
  PAYMENT_METHODS,
  PAYMENT_TIMINGS,
  PAYMENT_NOTE_MAX,
  paymentStateFrom,
  serializePaymentInfo,
} from "@/lib/payment-info";

// Icons appear only here, in the picker (option א) — the public page uses one
// Wallet icon for the whole answer. Bit and PayBox share the phone glyph: no
// brand marks (no logos of third parties in product UI).
const METHOD_ICON = {
  bit: DeviceMobile,
  paybox: DeviceMobile,
  bank_transfer: Bank,
  cash: Money,
  credit_card: CreditCard,
};

function MethodTile({ method, on, label, onToggle }) {
  const Icon = METHOD_ICON[method];
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      data-testid={`payment-method-${method}`}
      className={`relative flex flex-col items-center justify-center gap-1.5 min-h-[72px] rounded-lg px-2 py-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        on ? "bg-green-50 text-primary font-medium ring-2 ring-primary" : "bg-background-alt text-text hover:bg-green-50"
      }`}
    >
      {on && (
        <Check size={14} weight="bold" aria-hidden="true" className="absolute top-1.5 start-1.5" />
      )}
      <Icon size={24} weight={on ? "fill" : "regular"} aria-hidden="true" />
      <span className="leading-tight text-center">{label}</span>
    </button>
  );
}

function SelectAllSwitch({ on, label, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span id="payment-select-all-label" className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="payment-select-all-label"
        onClick={onToggle}
        data-testid="payment-select-all"
        className="group relative shrink-0 inline-flex items-center justify-center min-h-touch min-w-touch -my-2.5 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={`relative block w-10 h-6 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-primary/40 ${on ? "bg-primary" : "bg-border"}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-surface shadow transition-all ${on ? "end-1" : "start-1"}`}
          />
        </span>
      </button>
    </div>
  );
}

/**
 * @param {{
 *   profile: any,
 *   onSave: any,
 *   reportDirty?: (key: string, dirty: boolean) => void,
 * }} props
 */
export default function PaymentInfoEditor({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.payment_info");
  const seed = profile?.payment_info ?? null;
  const seedPayload = useMemo(() => JSON.stringify(serializePaymentInfo(paymentStateFrom(seed))), [seed]);

  const [state, setState] = useState(() => paymentStateFrom(seed));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Re-seed only when the stored VALUE changes (another card's save), keyed on
  // the serialized payload — a refetch that hands back an equal object must
  // not clobber in-progress edits.
  useEffect(() => {
    setState(paymentStateFrom(JSON.parse(seedPayload)));
  }, [seedPayload]);

  const current = serializePaymentInfo(state);
  const dirty = JSON.stringify(current) !== seedPayload;
  const allOn = PAYMENT_METHODS.every((m) => state.methods.has(m));

  useEffect(() => {
    reportDirty("paymentInfo", dirty);
    return () => reportDirty("paymentInfo", false);
  }, [dirty, reportDirty]);

  const update = (patch) => {
    setState((s) => ({ ...s, ...patch }));
    setSaved(false);
    setErrorMsg(null);
  };

  const toggleMethod = (m) => {
    const next = new Set(state.methods);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    update({ methods: next });
  };

  const toggleAll = () => update({ methods: new Set(allOn ? [] : PAYMENT_METHODS) });
  const toggleTiming = (k) => update({ timing: state.timing === k ? null : k });

  const revert = () => {
    setState(paymentStateFrom(seed));
    setSaved(false);
    setErrorMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      const payload = { payment_info: current };
      await api.put("/producers/me", payload);
      onSave(payload);
      setSaved(true);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-fg-muted">{t("where")}</p>

      <fieldset className="space-y-3">
        <legend className="sr-only">{t("heading")}</legend>
        <SelectAllSwitch on={allOn} label={t("select_all")} onToggle={toggleAll} />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <MethodTile
              key={m}
              method={m}
              on={state.methods.has(m)}
              label={t(`methods.${m}`)}
              onToggle={() => toggleMethod(m)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium mb-2">{t("timing_heading")}</legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_TIMINGS.map((k) => {
            const on = state.timing === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTiming(k)}
                data-testid={`payment-timing-${k}`}
                className={`min-h-touch rounded-full px-4 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  on ? "bg-primary text-white font-medium" : "bg-background-alt text-text hover:bg-green-50"
                }`}
              >
                {t(`timings.${k}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="payment-note" className="block text-sm font-medium mb-1.5">
          {t("note_label")}
        </label>
        <input
          id="payment-note"
          type="text"
          value={state.note}
          maxLength={PAYMENT_NOTE_MAX}
          onChange={(e) => update({ note: e.target.value })}
          placeholder={t("note_placeholder")}
          aria-describedby="payment-note-help"
          data-testid="payment-note"
          className="w-full text-sm border border-border rounded-sm px-3 py-2 bg-surface"
        />
        <p id="payment-note-help" className="mt-1 text-xs text-fg-muted">{t("note_help")}</p>
      </div>

      {errorMsg && (
        <p className="flex items-center gap-1.5 text-xs text-danger-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving || !dirty}
          variant="primary"
          size="sm"
          data-testid="payment-info-save"
        >
          {saving ? t("saving") : t("save_cta")}
        </Button>
        {dirty && (
          <button
            type="button"
            onClick={revert}
            disabled={saving}
            data-testid="payment-info-revert"
            className="border border-border text-fg-muted px-4 py-2 rounded-full text-sm font-medium hover:border-primary hover:text-text transition disabled:opacity-60"
          >
            {t("revert_cta")}
          </button>
        )}
      </div>

      {saved && !errorMsg && (
        <p className="flex items-center gap-1.5 text-xs text-primary" role="status" data-testid="payment-info-save-success">
          <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {t("save_success")}
        </p>
      )}
    </div>
  );
}
