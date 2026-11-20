// @ts-check
"use client";
/**
 * Module:   AdminDeliveryPaymentPanel
 * Purpose:  Lets the admin fill a business's delivery (day + minimum per
 *           city), order window and payment info — the same three editors the
 *           owner uses on /producer/dashboard/edit, saved to
 *           PUT /admin/producers/{id} instead of /producers/me (MEH-3475).
 * Does NOT: own any form logic or copy. Each editor is the owner's, mounted
 *           with `saveUrl`; a fix there lands here too.
 * Related:  app/[locale]/producer/dashboard/edit/cards/DeliveryCard.jsx,
 *           OrderWindowEditor.jsx, PaymentInfoEditor.jsx;
 *           backend/app/routers/admin.py admin_update_producer.
 * History:  MEH-3475 (creation)
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { DeliveryCard } from "@/app/[locale]/producer/dashboard/edit/cards/DeliveryCard";
import OrderWindowEditor from "@/app/[locale]/producer/dashboard/edit/OrderWindowEditor";
import PaymentInfoEditor from "@/app/[locale]/producer/dashboard/edit/PaymentInfoEditor";

/**
 * @param {{
 *   producerId: string,
 *   producer: object,
 * }} props
 */
export default function AdminDeliveryPaymentPanel({ producerId, producer }) {
  const t = useTranslations("dashboard.producer");
  // The editors re-seed from `profile` after a save, so they need the saved
  // values back. Kept HERE and not in the page's producer: the page passes
  // that object to ProducerForm as `initial`, and a change to it resets the
  // whole form, dropping the admin's unsaved edits there.
  const [profile, setProfile] = useState(producer);
  /** @param {object} patch */
  const onSave = (patch) => setProfile((p) => ({ ...p, ...patch }));
  const saveUrl = `/admin/producers/${producerId}`;
  const sections = [
    { key: "delivery", title: t("delivery.heading"), Editor: DeliveryCard },
    { key: "order-window", title: t("order_window.heading"), Editor: OrderWindowEditor },
    { key: "payment-info", title: t("payment_info.heading"), Editor: PaymentInfoEditor },
  ];
  return (
    <div className="mb-6 space-y-4" data-testid="admin-delivery-payment">
      {sections.map(({ key, title, Editor }) => (
        <section
          key={key}
          className="rounded-sm border border-border bg-surface p-4"
          data-testid={`admin-section-${key}`}
        >
          <h2 className="text-base font-semibold mb-3">{title}</h2>
          <Editor profile={profile} onSave={onSave} saveUrl={saveUrl} />
        </section>
      ))}
    </div>
  );
}
