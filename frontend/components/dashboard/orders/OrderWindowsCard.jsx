// @ts-check
"use client";

/**
 * Module:   OrderWindowsCard
 * Purpose:  The weekly hand-over windows: on which days and hours a customer
 *           can collect (or get a delivery). The order slots are cut from
 *           these.
 * Touches:  PUT /producers/me/order-windows (the whole week at once).
 * Does NOT: edit producers.order_window (when the business ANSWERS orders,
 *           a different fact, edit/OrderWindowEditor.jsx). It only reads it
 *           once, to prefill an empty week (approved stage-4 design).
 * Related:  lib/order-window.js (daysFromOrderWindow), lib/hours.js (DAY_KEYS)
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown, Plus, X } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { detailToMessage } from "@/lib/errors";
import { DAY_KEYS } from "@/lib/hours";
import { daysFromOrderWindow } from "@/lib/order-window";
import { saveWindows } from "@/lib/product-orders";

const HHMM_LENGTH = 5;
const MAX_WINDOWS = 28;
const NEW_ROW = { weekday: 0, start_time: "09:00", end_time: "12:00", fulfilment: "pickup" };

/** Stored windows → editable rows ("HH:MM"). */
function rowsFrom(windows) {
  return windows.map((row) => ({
    ...row,
    start_time: String(row.start_time).slice(0, HHMM_LENGTH),
    end_time: String(row.end_time).slice(0, HHMM_LENGTH),
  }));
}

/** producers.order_window → pickup rows, to prefill an empty week. */
export function prefillFrom(orderWindow) {
  return daysFromOrderWindow(orderWindow).flatMap((day, weekday) =>
    day.open
      ? day.ranges.map((range) => ({ weekday, start_time: range.from, end_time: range.to, fulfilment: "pickup" }))
      : [],
  );
}

/** @param {{ row: any, onChange: (row: any) => void, onRemove: () => void }} props */
function WindowRow({ row, onChange, onRemove }) {
  const t = useTranslations("dashboard.producer.orders.windows");
  const tHours = useTranslations("dashboard.producer.order_window");
  const tDays = useTranslations("opening_hours.weekdays");
  const set = (/** @type {string} */ key, /** @type {any} */ value) => onChange({ ...row, [key]: value });
  return (
    <li className="flex flex-wrap items-end gap-2" data-testid="order-window-row">
      <Select size="sm" label={t("day")} value={row.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>
        {DAY_KEYS.map((key, index) => (
          <option key={key} value={index}>{tDays(key)}</option>
        ))}
      </Select>
      <Select size="sm" label={t("kind")} value={row.fulfilment} onChange={(e) => set("fulfilment", e.target.value)}>
        <option value="pickup">{t("pickup")}</option>
        <option value="delivery">{t("delivery")}</option>
      </Select>
      <Input size="sm" type="time" dir="ltr" label={tHours("from_label")} value={row.start_time} onChange={(e) => set("start_time", e.target.value)} />
      <Input size="sm" type="time" dir="ltr" label={tHours("to_label")} value={row.end_time} onChange={(e) => set("end_time", e.target.value)} />
      <Button variant="ghost" size="sm" onClick={onRemove} aria-label={tHours("remove_range")}>
        <X size={18} aria-hidden="true" />
      </Button>
    </li>
  );
}

/** @param {{ windows: any[], orderWindow: any, collapsed?: boolean, onSaved?: (windows: any[]) => void }} props — collapsed: see OrderSettingsCard; onSaved: the week as saved */
export default function OrderWindowsCard({ windows, orderWindow, collapsed = false, onSaved = undefined }) {
  const t = useTranslations("dashboard.producer.orders.windows");
  const tHours = useTranslations("dashboard.producer.order_window");
  const prefilled = windows.length === 0 ? prefillFrom(orderWindow) : [];
  const [rows, setRows] = useState(() => (prefilled.length ? prefilled : rowsFrom(windows)));
  const [state, setState] = useState(/** @type {{ busy?: boolean, error?: string|null, saved?: boolean }} */ ({}));

  const update = (/** @type {number} */ index, /** @type {any} */ row) => setRows((old) => old.map((item, i) => (i === index ? row : item)));
  const remove = (/** @type {number} */ index) => setRows((old) => old.filter((_, i) => i !== index));
  const save = async () => {
    setState({ busy: true });
    try {
      const saved = await saveWindows(rows);
      setRows(rowsFrom(saved));
      onSaved?.(saved);
      setState({ saved: true });
    } catch (err) {
      setState({ error: detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || tHours("save_error") });
    }
  };

  return (
    <details
      open={!collapsed}
      className="group rounded-lg border border-border bg-surface p-4 space-y-3"
      id="order-windows"
      data-testid="order-windows"
    >
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-touch focus-ring rounded-sm [&::-webkit-details-marker]:hidden">
        <h2 className="font-bold text-lg text-text">{t("title")}</h2>
        <CaretDown size={18} aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <p className="text-sm text-fg-muted">{t("lead")}</p>
      {prefilled.length > 0 && <InlineMessage tone="info">{t("prefilled")}</InlineMessage>}
      {rows.length === 0 && <p className="text-sm text-fg-muted">{t("empty")}</p>}
      <ul className="space-y-3">
        {rows.map((row, index) => (
          <WindowRow key={`${index}-${row.weekday}`} row={row} onChange={(next) => update(index, next)} onRemove={() => remove(index)} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {rows.length < MAX_WINDOWS && (
          <Button variant="outlined" size="sm" leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={() => setRows((old) => [...old, NEW_ROW])}>
            {t("add")}
          </Button>
        )}
        <Button size="sm" onClick={save} loading={state.busy} data-testid="order-windows-save">{tHours("save_cta")}</Button>
      </div>
      {state.error && <InlineMessage tone="error">{state.error}</InlineMessage>}
      {state.saved && <InlineMessage tone="success">{t("saved")}</InlineMessage>}
    </details>
  );
}
