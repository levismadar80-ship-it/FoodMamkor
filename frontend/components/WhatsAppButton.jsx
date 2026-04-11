"use client";

import { useRef, useState } from "react";
import { WhatsappLogo } from "@phosphor-icons/react";

/**
 * WhatsApp CTA for home-product cards.
 *
 * docs/archive/FEEDBACK_FIXES.md small items — prevent double-click: the click
 * handler fires onClick (which logs a whatsapp_click on the backend)
 * only ONCE per 2-second window, and the button visibly disables
 * itself for 1 second so users see that something happened. The
 * `<a>` still opens WhatsApp normally.
 */
export default function WhatsAppButton({ phone, productTitle, onClick }) {
  const [pending, setPending] = useState(false);
  const firedRef = useRef(false);

  if (!phone) return null;

  // Clean phone and convert Israeli local numbers to international format
  let cleanPhone = phone.replace(/[^0-9+]/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "972" + cleanPhone.slice(1);
  } else if (!cleanPhone.startsWith("+") && !cleanPhone.startsWith("972")) {
    cleanPhone = "972" + cleanPhone;
  }
  cleanPhone = cleanPhone.replace(/^\+/, "");
  const message = encodeURIComponent(
    `היי, ראיתי את "${productTitle}" במהמקור ואשמח לשמוע פרטים!`,
  );
  const url = `https://wa.me/${cleanPhone}?text=${message}`;

  const handleClick = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setPending(true);
    if (onClick) onClick();
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
      className={`inline-flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-[12px] hover:bg-[#1ea855] transition text-sm w-full justify-center font-medium focus-visible:ring-2 focus-visible:ring-[#25D366]/40 ${
        pending ? "opacity-70 pointer-events-none" : ""
      }`}
    >
      <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
      {pending ? "נפתח..." : "WhatsApp"}
    </a>
  );
}
