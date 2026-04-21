"use client";

import { useRef, useState } from "react";
import { WhatsappLogo } from "@phosphor-icons/react";
import { normalizePhone } from "@/lib/utils";

/**
 * WhatsApp CTA for home-product cards + producer detail pages.
 *
 * docs/archive/FEEDBACK_FIXES.md small items — prevent double-click: the click
 * handler fires onClick (which logs a whatsapp_click on the backend)
 * only ONCE per 2-second window, and the button visibly disables
 * itself for 1 second so users see that something happened. The
 * `<a>` still opens WhatsApp normally.
 *
 * feature/producer-analytics — if `producerId` is passed, also fire a
 * fire-and-forget beacon to POST /producers/{id}/whatsapp-click so the
 * producer dashboard gets a real count. sendBeacon is guaranteed not to
 * block the window.open, unlike fetch(). Gracefully no-ops on servers
 * or environments without sendBeacon.
 */
export default function WhatsAppButton({ phone, productTitle, onClick, producerId }) {
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

  const message = encodeURIComponent(
    `היי, ראיתי את "${productTitle}" במהמקור ואשמח לשמוע פרטים!`,
  );
  const url = `https://wa.me/${cleanPhone}?text=${message}`;

  const handleClick = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setPending(true);
    if (onClick) onClick();
    // feature/producer-analytics — fire-and-forget beacon to the producer
    // whatsapp-click endpoint. Only fires when called from a producer
    // context (producerId present). sendBeacon is the right tool: it
    // survives page navigation and doesn't block the wa.me window opening.
    if (producerId && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(`/api/producers/${producerId}/whatsapp-click`);
      } catch {
        // ignore — tracking is best-effort
      }
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
      aria-disabled={pending || undefined}
      className={`btn-whatsapp inline-flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm w-full justify-center font-medium ${
        pending ? "opacity-70 pointer-events-none" : ""
      }`}
    >
      <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
      {pending ? "נפתח..." : "WhatsApp"}
    </a>
  );
}
