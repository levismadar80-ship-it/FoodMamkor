// @ts-check
"use client";

/**
 * Module:   OrderSettingsCard
 * Purpose:  The business's on-site ordering settings: on/off, auto-confirm
 *           with its per-slot cap, the customers' cancel cutoff, Shabbat and
 *           festivals, minimum order, slot length and how far ahead.
 * Touches:  PUT /producers/me/order-settings (the whole form, every field —
 *           the API refuses a partial body so an omitted field never clears).
 * Does NOT: show `alcohol_licensed` as editable (admin only), or the hand-over
 *           windows (OrderWindowsCard).
 * History:  MEH-3316 (creation; stage 4 of MEH-3216); MEH-3216 gaps (the
 *           per-slot cap is always shown and holds for manual confirm too)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import { detailToMessage } from "@/lib/errors";
import { agorotFromInput, saveSettings, shekelsText } from "@/lib/product-orders";

const SLOT_MINUTES = [30, 60, 120];
const HOUR_CHOICES = [0, 1, 2, 3, 6, 12, 24, 48];
const DEFAULT_CAP = 3;

/** The choices, plus the stored value when it is not one of them. */
function withCurrent(choices, current) {
  return choices.includes(current) ? choices : [...choices, current].sort((a, b) => a - b);
}

/** @param {{ id: string, label: string, checked: boolean, onChange: (value: boolean) => void }} props */
function SwitchRow({ id, label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span id={id} className="text-sm text-text">{label}</span>
      <Switch checked={checked} aria-labelledby={id} onClick={() => onChange(!checked)} data-testid={id} />
    </div>
  );
}

/** Settings → the form's string fields. */
function toForm(settings) {
  return {
    ...settings,
    cap: String(settings.auto_confirm_slot_cap ?? ""),
    minimum: (settings.min_order_agorot ?? null) === null ? "" : shekelsText(settings.min_order_agorot),
  };
}

/** The form → the PUT body, or a message key when it cannot be sent. */
export function toBody(form) {
  const minimum = agorotFromInput(form.minimum);
  const cap = form.cap === "" ? null : Number(form.cap);
  if (Number.isNaN(minimum) || (cap !== null && !Number.isInteger(cap))) return { problem: "bad_amount" };
  if (form.auto_confirm && !(cap && cap >= 1)) return { problem: "cap_required" };
  return {
    body: {
      enabled: form.enabled,
      auto_confirm: form.auto_confirm,
      auto_confirm_slot_cap: cap !== null && cap >= 1 ? cap : null,
      cancel_cutoff_hours: form.cancel_cutoff_hours,
      shabbat_observant: form.shabbat_observant,
      min_order_agorot: minimum,
      slot_minutes: form.slot_minutes,
      lead_time_hours: form.lead_time_hours,
    },
  };
}

/** @param {{ form: any, set: (key: string, value: any) => void }} props */
function TimingFields({ form, set }) {
  const t = useTranslations("dashboard.producer.orders.settings");
  const number = (/** @type {any} */ e) => Number(e.target.value);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select label={t("cutoff_label")} value={form.cancel_cutoff_hours} onChange={(e) => set("cancel_cutoff_hours", number(e))}>
        {withCurrent(HOUR_CHOICES, form.cancel_cutoff_hours).map((hours) => (
          <option key={hours} value={hours}>{t("cutoff", { hours })}</option>
        ))}
      </Select>
      <Select label={t("slot_minutes")} value={form.slot_minutes} onChange={(e) => set("slot_minutes", number(e))}>
        {SLOT_MINUTES.map((minutes) => (
          <option key={minutes} value={minutes}>{t(`slot_${minutes}`)}</option>
        ))}
      </Select>
      <Select label={t("lead_time")} value={form.lead_time_hours} onChange={(e) => set("lead_time_hours", number(e))}>
        {withCurrent(HOUR_CHOICES, form.lead_time_hours).map((hours) => (
          <option key={hours} value={hours}>{t("lead_hours", { hours })}</option>
        ))}
      </Select>
    </div>
  );
}

/**
 * @param {{ settings: any, onSaved: (settings: any) => void, collapsed?: boolean }} props
 *   collapsed: start closed — the page closes it once ordering is set up,
 *   so the tab opens on the orders and the one-time settings wait a tap away.
 */
export default function OrderSettingsCard({ settings, onSaved, collapsed = false }) {
  const t = useTranslations("dashboard.producer.orders.settings");
  const tActions = useTranslations("dashboard.producer.orders.actions");
  const [form, setForm] = useState(() => toForm(settings));
  const [state, setState] = useState(/** @type {{ busy?: boolean, error?: string|null, saved?: boolean }} */ ({}));
  const set = (/** @type {string} */ key, /** @type {any} */ value) => setForm((old) => ({ ...old, [key]: value }));

  const save = async () => {
    const { body, problem } = toBody(form);
    if (problem) return setState({ error: t(problem) });
    setState({ busy: true });
    try {
      onSaved(await saveSettings(body));
      return setState({ saved: true });
    } catch (err) {
      return setState({ error: detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || tActions("failed") });
    }
  };

  return (
    <details
      open={!collapsed}
      className="group rounded-lg border border-border bg-surface p-4 space-y-3"
      data-testid="order-settings"
    >
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-touch focus-ring rounded-sm [&::-webkit-details-marker]:hidden">
        <h2 className="font-bold text-lg text-text">{t("title")}</h2>
        <CaretDown size={18} aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <p className="text-sm text-fg-muted">{t("lead")}</p>
      <SwitchRow id="orders-enabled" label={t("enabled")} checked={form.enabled} onChange={(on) => set("enabled", on)} />
      <SwitchRow
        id="orders-auto"
        label={t("auto_confirm", { count: form.cap || DEFAULT_CAP })}
        checked={form.auto_confirm}
        onChange={(on) => setForm((old) => ({ ...old, auto_confirm: on, cap: old.cap || String(DEFAULT_CAP) }))}
      />
      {/* MEH-3216 gaps: one cap per slot, by hand or automatic — the server
          stops offering a slot that holds this many open orders. */}
      <Input label={t("slot_cap")} inputMode="numeric" dir="ltr" value={form.cap} onChange={(e) => set("cap", e.target.value)} data-testid="orders-slot-cap" />
      <SwitchRow id="orders-shabbat" label={t("shabbat")} checked={form.shabbat_observant} onChange={(on) => set("shabbat_observant", on)} />
      <Input label={t("min_order")} inputMode="decimal" dir="ltr" value={form.minimum} onChange={(e) => set("minimum", e.target.value)} />
      <TimingFields form={form} set={set} />
      {state.error && <InlineMessage tone="error">{state.error}</InlineMessage>}
      {state.saved && <InlineMessage tone="success">{t("saved")}</InlineMessage>}
      <Button onClick={save} loading={state.busy} data-testid="orders-settings-save">{t("save")}</Button>
    </details>
  );
}
