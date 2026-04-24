/**
 * Primary contact method helpers (MEH-17). Pure functions — no React.
 *
 * Producers pick one of whatsapp | phone | website | email as the
 * CTA channel at registration. ProducerDetail renders it as the big
 * primary button; ProducerCard highlights the matching icon.
 */

import { normalizePhone, getWhatsAppHref } from "@/lib/utils";

export const CONTACT_METHODS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "phone", label: "טלפון" },
  { key: "website", label: "אתר" },
  { key: "email", label: "אימייל" },
];

/** Default-safe accessor. Falls back to "whatsapp" for old rows. */
export function getPrimaryMethod(producer) {
  const m = producer?.primary_contact_method;
  return CONTACT_METHODS.some((c) => c.key === m) ? m : "whatsapp";
}

/**
 * Build the href for the primary CTA. Returns null when the producer
 * is missing the field the method needs — caller should hide the
 * button (backend validation should prevent this, but defense in depth).
 */
export function getPrimaryContactHref(producer) {
  if (!producer) return null;
  const method = getPrimaryMethod(producer);
  switch (method) {
    case "whatsapp": {
      const digits = normalizePhone(producer.phone);
      if (!digits) return null;
      const msg = `היי! מצאתי אותך במהמקור — ${producer.name || ""}`;
      return getWhatsAppHref(digits, msg);
    }
    case "phone": {
      if (!producer.phone) return null;
      return `tel:${producer.phone}`;
    }
    case "website": {
      const raw = (producer.website || "").trim();
      if (!raw) return null;
      return raw.startsWith("http") ? raw : `https://${raw}`;
    }
    case "email": {
      const email = (producer.contact_email || "").trim();
      if (!email) return null;
      return `mailto:${email}`;
    }
    default:
      return null;
  }
}

/** Hebrew CTA label for the primary contact button. */
export function getPrimaryContactLabel(producer) {
  switch (getPrimaryMethod(producer)) {
    case "whatsapp":
      return "שלחי הודעה";
    case "phone":
      return "התקשרי";
    case "website":
      return "בקרי באתר";
    case "email":
      return "שלחי מייל";
    default:
      return "יצירת קשר";
  }
}

/** True when the primary CTA will open in a new tab (not wa.me/tel/mailto). */
export function isPrimaryExternal(producer) {
  return getPrimaryMethod(producer) === "website";
}
