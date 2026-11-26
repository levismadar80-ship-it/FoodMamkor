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
 * History:  MEH-3475 (creation); MEH-3915 (each editor reports its unsaved
 *           edits to the page, which holds «שמרו שינויים» until they are saved)
 */
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { DeliveryCard } from "@/app/[locale]/producer/dashboard/edit/cards/DeliveryCard";
import OrderWindowEditor from "@/app/[locale]/producer/dashboard/edit/OrderWindowEditor";
import PaymentInfoEditor from "@/app/[locale]/producer/dashboard/edit/PaymentInfoEditor";

/**
 * MEH-3915: the key each editor reports through `reportDirty`, and its
 * heading — the page names the section in «יש שינויים שלא נשמרו ב…».
 * (The editors' own keys: DeliveryCard "delivery", OrderWindowEditor
 * "orderWindow", PaymentInfoEditor "paymentInfo".)
 */
const SECTION_TITLE_KEYS = {
  delivery: "delivery.heading",
  orderWindow: "order_window.heading",
  paymentInfo: "payment_info.heading",
};

const noop = () => {};

/**
 * MEH-3915: the edit page's record of which of these sections, and the
 * locations editor, hold unsaved edits. Pass `reportDirty` to the panel; `unsavedSections` (the headings)
 * holds ProducerForm's save and PageFillPanel's (whose save remounts the
 * panel); leaving the page asks first, as on the owner's dashboard.
 */
export function useUnsavedSections() {
  const t = useTranslations("dashboard.producer");
  const [dirty, setDirty] = useState(/** @type {Record<string, boolean>} */ ({}));
  // Stable: each editor calls it from an effect and its cleanup.
  const reportDirty = useCallback(
    (/** @type {string} */ key, /** @type {boolean} */ isDirty) =>
      setDirty((d) => (!!d[key] === isDirty ? d : { ...d, [key]: isDirty })),
    [],
  );
  // The locations editor (inside ProducerForm, saves per location) reports
  // "locations" the same way; it comes first, as on the page.
  const tLoc = useTranslations("settings.locations");
  /** @type {[string, string][]} */
  const titles = [
    ["locations", tLoc("section_heading")],
    ...Object.entries(SECTION_TITLE_KEYS).map(([key, titleKey]) => /** @type {[string, string]} */ ([key, t(titleKey)])),
  ];
  const unsavedSections = titles.filter(([key]) => dirty[key]).map(([, title]) => title);
  useUnsavedGuard(unsavedSections.length > 0, t("unsaved_guard.confirm"));
  return { reportDirty, unsavedSections };
}

/**
 * @param {{
 *   producerId: string,
 *   producer: object,
 *   reportDirty?: (key: string, dirty: boolean) => void,
 * }} props
 */
export default function AdminDeliveryPaymentPanel({ producerId, producer, reportDirty = noop }) {
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
    // DeliveryCard carries no JSDoc, so its `reportDirty = () => {}` default is
    // read as a zero-argument type; it is called with (key, dirty).
    { key: "delivery", title: t(SECTION_TITLE_KEYS.delivery), Editor: /** @type {any} */ (DeliveryCard) },
    { key: "order-window", title: t(SECTION_TITLE_KEYS.orderWindow), Editor: OrderWindowEditor },
    { key: "payment-info", title: t(SECTION_TITLE_KEYS.paymentInfo), Editor: PaymentInfoEditor },
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
          <Editor profile={profile} onSave={onSave} saveUrl={saveUrl} reportDirty={reportDirty} />
        </section>
      ))}
    </div>
  );
}
