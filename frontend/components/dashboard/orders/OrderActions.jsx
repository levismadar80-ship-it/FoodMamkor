// @ts-check
"use client";

/**
 * Module:   OrderActions
 * Purpose:  The buttons an order's status offers the business, and the one
 *           dialog a button opens. A button with nothing to ask (confirm a
 *           fixed-price order, «מוכנה לאיסוף», «הלקוח לא הגיע») posts at once.
 * Touches:  POST /producers/me/product-orders/{id}/{action} via lib/product-orders.
 * Does NOT: decide legality — the server's state machine does. «הלקוח לא
 *           הגיע» shows only after the slot ended, because the server refuses
 *           it before then.
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { detailToMessage } from "@/lib/errors";
import { act, offeredSlots } from "@/lib/product-orders";
import {
  CancelDialog,
  ConfirmWeighedDialog,
  DeclineDialog,
  HandedDialog,
  ProposeDialog,
} from "./OrderDialogs";

/**
 * Which buttons a status offers, in display order. `dialog` names the form a
 * button opens; without it the button posts `action` directly.
 * @param {any} order
 * @param {Date} now
 */
export function buttonsFor(order, now) {
  const ended = new Date(order.slot_end) <= now;
  const pickup = order.fulfilment === "pickup";
  switch (order.status) {
    case "pending":
      return [
        { key: "confirm", dialog: order.has_estimate ? "confirm" : null, action: "confirm", primary: true },
        { key: "propose", dialog: "propose" },
        { key: "decline", dialog: "decline" },
      ];
    case "change_proposed":
      return [{ key: "cancel", dialog: "cancel" }];
    case "confirmed":
      // «מוכנה לאיסוף» is approved copy for a pickup; a delivery goes
      // straight to «נמסר ללקוח».
      return [
        ...(pickup ? [{ key: "ready", action: "ready", primary: true }] : []),
        { key: "handed", dialog: "handed", primary: !pickup },
        ...(ended ? [{ key: "no_show", action: "no-show" }] : []),
        { key: "cancel", dialog: "cancel" },
      ];
    case "ready":
      return [
        { key: "handed", dialog: "handed", primary: true },
        ...(ended ? [{ key: "no_show", action: "no-show" }] : []),
        { key: "cancel", dialog: "cancel" },
      ];
    default:
      return [];
  }
}

/** @param {{ open: string|null, order: any, slots: any[], close: () => void, done: (order: any) => void }} props */
function OpenDialog({ open, order, slots, close, done }) {
  const common = { order, onClose: close, onDone: done };
  if (open === "confirm") return <ConfirmWeighedDialog {...common} />;
  if (open === "decline") return <DeclineDialog {...common} />;
  if (open === "propose") return <ProposeDialog {...common} slots={slots} />;
  if (open === "handed") return <HandedDialog {...common} />;
  if (open === "cancel") return <CancelDialog {...common} />;
  return null;
}

/** @param {{ order: any, onChanged: (order: any) => void }} props */
export default function OrderActions({ order, onChanged }) {
  const t = useTranslations("dashboard.producer.orders.actions");
  const [open, setOpen] = useState(/** @type {string|null} */ (null));
  const [busy, setBusy] = useState(/** @type {string|null} */ (null));
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [slots, setSlots] = useState(/** @type {any[]} */ ([]));
  const buttons = buttonsFor(order, new Date());
  if (buttons.length === 0) return null;

  const done = (/** @type {any} */ updated) => {
    setOpen(null);
    onChanged(updated);
  };
  const press = async (/** @type {any} */ button) => {
    setError(null);
    if (button.dialog === "propose") setSlots(await offeredSlots(order.producer_id).catch(() => []));
    if (button.dialog) return setOpen(button.dialog);
    setBusy(button.key);
    try {
      onChanged(await act(order.id, button.action));
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("failed"));
    } finally {
      setBusy(null);
    }
    return undefined;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" data-testid="order-actions">
        {buttons.map((button) => (
          <Button
            key={button.key}
            size="sm"
            variant={button.primary ? "primary" : "outlined"}
            loading={busy === button.key}
            onClick={() => press(button)}
            data-testid={`order-action-${button.key}`}
          >
            {t(button.key)}
          </Button>
        ))}
      </div>
      {error && <InlineMessage tone="error" role="alert">{error}</InlineMessage>}
      <OpenDialog open={open} order={order} slots={slots} close={() => setOpen(null)} done={done} />
    </div>
  );
}
