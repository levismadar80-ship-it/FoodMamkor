"use client";

import { useRef, useState } from "react";
import { WhatsappLogo } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { normalizePhone, getWhatsAppHref } from "@/lib/utils";
import { pingWhatsAppBeacon, markWhatsAppClickedLocal } from "@/lib/contact-tracking";

/**
 * WhatsApp CTA for home-product cards + producer detail pages.
 *
 * docs/archive/FEEDBACK_FIXES.md small items — prevent double-click: the click
 * handler fires onClick (which logs a whatsapp_click on the backend)
 * only ONCE per 2-second window, and the button visibly disables
 * itself for 1 second so users see that something happened. The
 * `<a>` still opens WhatsApp normally.
 *
 * feature/producer-analytics — if `producerId` is passed, the click is
 * logged to POST /producers/{id}/whatsapp-click for the producer dashboard.
 * MEH-1426: this now routes through the shared contact-tracking helpers
 * (pingWhatsAppBeacon + markWhatsAppClickedLocal) instead of a private inline
 * sendBeacon — one attribution mechanism (closes the MEH-271 smell), and every
 * WhatsApp click both attributes to the logged-in user and unlocks the review
 * form. pingWhatsAppBeacon is auth-aware (fetch+Bearer when logged in,
 * sendBeacon fallback otherwise) and keepalive-safe so it survives navigation.
 */
/**
 * tone: "primary" (default, green `btn-whatsapp` fill — unchanged legacy
 * behavior) | "tertiary" (neutral outline). MEH-1146 chunk B demotes the
 * DeliveryBlock CTA to tertiary so the delivery section stops competing with
 * the contact card's single primary CTA (one-primary-per-viewport).
 *
 * label: optional per-instance override for the button text. Defaults to the
 * legacy bare "WhatsApp". MEH-1305 C: the DeliveryBlock instance passes a
 * Hebrew "שליחת הודעה בוואטסאפ" so the delivery CTA is no longer an untranslated
 * "WhatsApp" — WITHOUT changing the global default for every other consumer.
 */
export default function WhatsAppButton({ phone, productTitle, onClick, producerId, tone = "primary", label }) {
  const t = useTranslations("whatsapp.button");
  const [pending, setPending] = useState(false);
  const firedRef = useRef(false);

  if (!phone) return null;

  // Shared normalizer — handles local (0...) + E.164 (+972...) + parens
  // + dots + any other punctuation in one pass. See lib/utils.js for
  // the full behavior contract and lib/utils.test.mjs for edge-case
  // coverage. This replaces the inline-and-duplicated logic that used
  // to live here (and in ProducerCard, ProducerDetail, and MapComponent).
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return null;

  const url = getWhatsAppHref(cleanPhone, t("default_message", { productTitle }));

  const handleClick = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setPending(true);
    if (onClick) onClick();
    // MEH-1426: route the click through the shared contact-tracking helpers
    // instead of a private inline sendBeacon — this closes the MEH-271
    // duplicate-mechanism smell and enforces the invariant that EVERY WhatsApp
    // click both (a) attributes to the logged-in user (pingWhatsAppBeacon's
    // auth-aware fetch, so the reviews WA-gate can pass) and (b) unlocks the
    // review form (markWhatsAppClickedLocal). Only fires in a producer context.
    if (producerId) {
      pingWhatsAppBeacon(producerId);
      markWhatsAppClickedLocal(producerId);
    }
    // Release after 2s so the user can legitimately click again later.
    // The 1s disabled window also prevents the "did it work?" double-tap.
    setTimeout(() => {
      firedRef.current = false;
      setPending(false);
    }, 2000);
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      data-testid="whatsapp-cta"
      data-tone={tone}
      aria-disabled={pending || undefined}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm w-full justify-center font-medium transition ${
        tone === "tertiary"
          ? "border border-border text-primary-dark hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
          : "btn-whatsapp"
      } ${pending ? "opacity-70 pointer-events-none" : ""}`}
    >
      <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
      {pending ? t("opening") : (label || "WhatsApp")}
    </a>
  );
}
