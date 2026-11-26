// @ts-check
"use client";

/**
 * Module:   SupportContactSheet
 * Purpose:  The one «צרו קשר» sheet for business owners: WhatsApp · email ·
 *           form, in that order, wherever the dashboard offers to reach the
 *           team (help row, rejected / inactive banners, welcome card).
 *           The form row opens /contact with the business topic preselected.
 * History:  MEH-1355 (StatusSupportModal in dashboard/page.js) · MEH-3720
 *           (moved here, form row added — one contact pattern site-wide).
 */

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { ChatText, EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react";
import { Link as LocaleLink } from "@/i18n/navigation";
import useDialogFocus, { useDialogEscape } from "@/hooks/useDialogFocus";
import { env } from "@/lib/env";
import { CONTACT_EMAIL } from "@/lib/env.client";
import { getWhatsAppChatHref } from "@/lib/utils";

const ROW =
  "flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-green-50 transition";

/** @param {{ onClose: () => void }} props */
export default function SupportContactSheet({ onClose }) {
  const t = useTranslations("dashboard.producer.status.support");
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, true);
  useDialogEscape(true, onClose);
  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("section_aria")}
      data-testid="support-contact-sheet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="vv-pin bg-surface rounded-t-xl sm:rounded-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold text-text text-lg">{t("heading")}</h2>
        <p className="text-sm text-fg-muted">{t("body")}</p>
        <a
          href={getWhatsAppChatHref(env.NEXT_PUBLIC_SUPPORT_PHONE || "972500000000")}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="support-whatsapp"
          className={ROW}
        >
          <WhatsappLogo size={24} weight="fill" className="text-[#25D366] shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{t("whatsapp_label")}</p>
            <p className="text-xs text-fg-muted">{t("whatsapp_hours")}</p>
          </div>
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} data-testid="support-email" className={ROW}>
          <EnvelopeSimple size={24} className="text-primary shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{t("email_label")}</p>
            <p className="text-xs text-fg-muted" dir="ltr">{CONTACT_EMAIL}</p>
          </div>
        </a>
        <LocaleLink href="/contact?topic=business" data-testid="support-form" className={ROW}>
          <ChatText size={24} className="text-primary shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{t("form_label")}</p>
        </LocaleLink>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-md text-sm font-medium text-fg-muted hover:text-text transition"
        >
          {t("close_cta")}
        </button>
      </div>
    </div>
  );
}
