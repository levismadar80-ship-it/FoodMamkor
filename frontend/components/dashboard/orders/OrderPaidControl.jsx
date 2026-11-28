// @ts-check
"use client";

/**
 * Module:   OrderPaidControl
 * Purpose:  On the business's order card (MEH-3962): «סמנו כשולם», or, once
 *           marked, «✓ שולם» with an undo; and while the order is still owed
 *           for, a WhatsApp button with a ready payment reminder.
 * Touches:  POST /producers/me/product-orders/{id}/paid via lib/order-paid.js.
 *           The reminder opens wa.me in the business's own WhatsApp; the
 *           site sends nothing.
 * Does NOT: show the «לא שולם» badge (OrderCard's head does) or filter the
 *           list (OrdersBoard does).
 * Related:  components/dashboard/RescueTab.jsx (the same mark for a rescue
 *           bag, MEH-3897), lib/order-paid.js
 * History:  MEH-3962 (creation, 27/11/2026; review round 1: no sum for an
 *           estimate, no reminder without a phone)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WhatsappLogo } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { detailToMessage } from "@/lib/errors";
import { canMarkPaid, isOwed, setOrderPaid } from "@/lib/order-paid";
import { shekelsText, toPayAgorot } from "@/lib/product-orders";
import { getWhatsAppHref } from "@/lib/utils";

/** @param {{ order: any }} props */
function ReminderButton({ order }) {
  const t = useTranslations("dashboard.producer.orders.paid");
  // A weighed order with no final total yet: an estimate is not a sum to ask for.
  const exact = !order.has_estimate || (order.final_total_agorot ?? null) !== null;
  const text = exact
    ? t("reminder_text", { name: order.customer_name, total: shekelsText(toPayAgorot(order)) })
    : t("reminder_text_no_total", { name: order.customer_name });
  // REUSES: components/dashboard/orders/OrderWeekShareCard.jsx:42 — a WhatsApp
  // button that opens wa.me in a new tab (no raw <a>, MEH-3829).
  const send = () => window.open(getWhatsAppHref(order.customer_phone, text), "_blank", "noopener,noreferrer");
  return (
    <Button
      variant="text"
      size="sm"
      onClick={send}
      leadingIcon={<WhatsappLogo size={16} aria-hidden="true" />}
      data-testid="order-paid-remind"
    >
      {t("remind")}
    </Button>
  );
}

/** @param {{ order: any, onChanged: (order: any) => void }} props */
export default function OrderPaidControl({ order, onChanged }) {
  const t = useTranslations("dashboard.producer.orders.paid");
  const tActions = useTranslations("dashboard.producer.orders.actions");
  const tRescue = useTranslations("rescue.dashboard");  // «ביטול הסימון», one key (MEH-3897)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!order.paid_at && !canMarkPaid(order)) return null;

  const press = async (/** @type {boolean} */ paid) => {
    setBusy(true);
    setError("");
    try {
      onChanged(await setOrderPaid(order.id, paid));
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || tActions("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="order-paid-control">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {order.paid_at ? (
          <>
            <span className="text-sm font-medium text-primary" data-testid="order-paid">{`✓ ${t("paid")}`}</span>
            <Button variant="text" size="sm" loading={busy} onClick={() => press(false)} data-testid="order-paid-undo">
              {tRescue("unmark_paid")}
            </Button>
          </>
        ) : (
          <Button variant="outlined" size="sm" loading={busy} onClick={() => press(true)} data-testid="order-paid-mark">
            {t("mark")}
          </Button>
        )}
        {/* An erased buyer (deleted account) has no phone to remind. */}
        {isOwed(order) && order.customer_phone && <ReminderButton order={order} />}
      </div>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </div>
  );
}
