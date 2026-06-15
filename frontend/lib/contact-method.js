/**
 * Primary contact method helpers (MEH-17). Pure functions — no React.
 *
 * Producers pick one of whatsapp | phone | website | email | instagram |
 * facebook | external_order as the CTA channel (MEH-296 added the last
 * three). ProducerDetail renders it as the big primary button;
 * ProducerCard highlights the matching icon.
 */

import { normalizePhone, getWhatsAppHref } from "@/lib/utils";

export const CONTACT_METHODS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "phone", label: "טלפון" },
  { key: "website", label: "אתר" },
  { key: "email", label: "אימייל" },
  // MEH-296: instagram becomes selectable as primary; facebook + external_order new.
  { key: "instagram", label: "אינסטגרם" },
  { key: "facebook", label: "פייסבוק" },
  { key: "external_order", label: "טופס הזמנות" },
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
    case "instagram": {
      // MEH-296: strip leading "@" (mirrors the ContactSidebar tile).
      const handle = (producer.instagram || "").trim().replace(/^@+/, "");
      if (!handle) return null;
      return `https://instagram.com/${handle}`;
    }
    case "facebook": {
      const raw = (producer.facebook || "").trim();
      if (!raw) return null;
      return raw.startsWith("http") ? raw : `https://${raw}`;
    }
    case "external_order": {
      const raw = (producer.external_order_form || "").trim();
      if (!raw) return null;
      return raw.startsWith("http") ? raw : `https://${raw}`;
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
      // MEH-76 chunk 2 — S6 CTA variant C (D4 decision, 6.6): relabel only.
      // website-primary reads as an ordering affordance, not a brochure link.
      return "להזמנה באתר";
    case "email":
      return "שלחי מייל";
    // MEH-296: locked copy for the 3 new primary channels.
    case "instagram":
      return "שלחי הודעה באינסטגרם";
    case "facebook":
      return "שלחי הודעה בפייסבוק";
    case "external_order":
      return "להזמנה";
    default:
      return "יצירת קשר";
  }
}

/** True when the primary CTA will open in a new tab (not wa.me/tel/mailto). */
export function isPrimaryExternal(producer) {
  // MEH-296: instagram/facebook/external_order also open in a new tab.
  return ["website", "instagram", "facebook", "external_order"].includes(
    getPrimaryMethod(producer)
  );
}
