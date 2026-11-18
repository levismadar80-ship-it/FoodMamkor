// @ts-check
"use client";

/**
 * Module:   OrderDialogs
 * Purpose:  The four forms an order action may need: a final price after
 *           weighing, a decline reason, a proposed change, a hand-over code,
 *           and a cancel note. Each one posts its action and hands the
 *           server's updated order back.
 * Touches:  POST /producers/me/product-orders/{id}/{action} via lib/product-orders.
 * Does NOT: choose which dialog opens (OrderActions does) or validate a move
 *           (the server does; its Hebrew 409/422 is shown in the dialog).
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import InlineMessage from "@/components/ui/InlineMessage";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { detailToMessage } from "@/lib/errors";
import { act, agorotFromInput, dayLabel, hhmm, shekelsText } from "@/lib/product-orders";

const REASONS = /** @type {const} */ (["reason_stock", "reason_full", "reason_other"]);

/**
 * Posts one action and reports back. Returns [busy, error, run].
 * @param {{ order: any, onDone: (order: any) => void }} props
 */
function useAction({ order, onDone }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string|null} */ (null));
  /** @param {{ action: any, body?: Record<string, any> }} request */
  const run = async ({ action, body }) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await act(order.id, action, body));
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("failed"));
    } finally {
      setBusy(false);
    }
  };
  return /** @type {const} */ ([busy, error, run]);
}

/** @param {{ id: string, title: string, busy: boolean, error: string|null, onClose: () => void, onSubmit: (e: any) => void, children: any }} props */
function FormDialog({ id, title, busy, error, onClose, onSubmit, children }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const submit = (/** @type {any} */ e) => {
    e.preventDefault();
    onSubmit(e);
  };
  return (
    <Dialog labelledBy={id} size="sm" as="form" onSubmit={submit} onClose={onClose} testId={id}>
      <div className="p-5 space-y-4">
        <h2 id={id} className="font-bold text-lg text-text">{title}</h2>
        {children}
        {error && <InlineMessage tone="error" role="alert">{error}</InlineMessage>}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" type="button" onClick={onClose} data-autofocus>{t("back")}</Button>
          <Button type="submit" loading={busy}>{t("send")}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** @param {{ order: any, onClose: () => void, onDone: (order: any) => void }} props */
export function ConfirmWeighedDialog({ order, onClose, onDone }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const [busy, error, run] = useAction({ order, onDone });
  const [price, setPrice] = useState(shekelsText(order.estimated_total_agorot));
  const submit = () => {
    const agorot = agorotFromInput(price);
    run({ action: "confirm", body: Number.isNaN(agorot) ? {} : { final_total_agorot: agorot } });
  };
  return (
    <FormDialog id="order-confirm-dialog" title={t("final_price")} busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <Input
        label={t("final_price")}
        inputMode="decimal"
        dir="ltr"
        value={price}
        onChange={(/** @type {any} */ e) => setPrice(e.target.value)}
        helperText={t("final_price_help", { max: shekelsText(order.estimated_total_agorot) })}
      />
    </FormDialog>
  );
}

/** @param {{ order: any, onClose: () => void, onDone: (order: any) => void }} props */
export function DeclineDialog({ order, onClose, onDone }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const [busy, error, run] = useAction({ order, onDone });
  const [reason, setReason] = useState(/** @type {string} */ (REASONS[0]));
  const [other, setOther] = useState("");
  const submit = () => {
    const note = reason === "reason_other" ? other.trim() : t(reason);
    run({ action: "decline", body: note ? { note } : {} });
  };
  return (
    <FormDialog id="order-decline-dialog" title={t("decline_title")} busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <Select label={t("decline_title")} value={reason} onChange={(/** @type {any} */ e) => setReason(e.target.value)}>
        {REASONS.map((key) => (
          <option key={key} value={key}>{t(key)}</option>
        ))}
      </Select>
      {reason === "reason_other" && (
        <Textarea label={t("reason_text")} value={other} maxLength={500} onChange={(/** @type {any} */ e) => setOther(e.target.value)} />
      )}
    </FormDialog>
  );
}

/** @param {{ slots: any[], value: string, onChange: (value: string) => void }} props */
function SlotSelect({ slots, value, onChange }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const locale = useLocale();
  return (
    <Select label={t("propose_slot")} value={value} onChange={(/** @type {any} */ e) => onChange(e.target.value)}>
      <option value="">{t("propose_same_slot")}</option>
      {slots.map((slot) => (
        <option key={`${slot.fulfilment}-${slot.start}`} value={slot.start}>
          {`${dayLabel(slot.start, locale)} \u2066${hhmm(slot.start)}–${hhmm(slot.end)}\u2069`}
        </option>
      ))}
    </Select>
  );
}

/** @param {{ order: any, slots: any[], onClose: () => void, onDone: (order: any) => void }} props */
export function ProposeDialog({ order, slots, onClose, onDone }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const [busy, error, run] = useAction({ order, onDone });
  const [slot, setSlot] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [local, setLocal] = useState(/** @type {string|null} */ (null));
  const sameKind = slots.filter((item) => item.fulfilment === order.fulfilment);
  const submit = () => {
    const agorot = agorotFromInput(total);
    if (!slot && agorot === null) return setLocal(t("propose_needs_change"));
    setLocal(null);
    const body = { note: note.trim(), slot_start: slot || null, total_agorot: Number.isNaN(agorot) ? null : agorot };
    return run({ action: "propose-change", body });
  };
  return (
    <FormDialog id="order-propose-dialog" title={t("propose_title")} busy={busy} error={local ?? error} onClose={onClose} onSubmit={submit}>
      <SlotSelect slots={sameKind} value={slot} onChange={setSlot} />
      <Input label={t("propose_total")} inputMode="decimal" dir="ltr" value={total} onChange={(/** @type {any} */ e) => setTotal(e.target.value)} />
      <Textarea label={t("propose_note")} required value={note} maxLength={500} onChange={(/** @type {any} */ e) => setNote(e.target.value)} />
    </FormDialog>
  );
}

/** @param {{ order: any, onClose: () => void, onDone: (order: any) => void }} props */
export function HandedDialog({ order, onClose, onDone }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const [busy, error, run] = useAction({ order, onDone });
  const [code, setCode] = useState("");
  const submit = () => run({ action: "handed", body: code.trim() ? { pickup_code: code.trim() } : {} });
  return (
    <FormDialog id="order-handed-dialog" title={t("handed")} busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <Input label={t("pickup_code")} inputMode="numeric" dir="ltr" maxLength={4} value={code} onChange={(/** @type {any} */ e) => setCode(e.target.value)} />
    </FormDialog>
  );
}

/** @param {{ order: any, onClose: () => void, onDone: (order: any) => void }} props */
export function CancelDialog({ order, onClose, onDone }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const [busy, error, run] = useAction({ order, onDone });
  const [note, setNote] = useState("");
  const submit = () => run({ action: "cancel", body: note.trim() ? { note: note.trim() } : {} });
  return (
    <FormDialog id="order-cancel-dialog" title={t("cancel_title")} busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <p className="text-sm text-fg-muted">{t("cancel_lead")}</p>
      <Textarea label={t("cancel_note")} value={note} maxLength={500} onChange={(/** @type {any} */ e) => setNote(e.target.value)} />
    </FormDialog>
  );
}
