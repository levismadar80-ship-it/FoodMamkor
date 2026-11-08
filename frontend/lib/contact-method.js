/**
 * Primary contact method helpers (MEH-17). Pure functions — no React.
 *
 * Producers pick one of whatsapp | phone | website | email | instagram |
 * facebook | external_order as the CTA channel (MEH-296 added the last
 * three). ProducerDetail renders it as the big primary button;
 * ProducerCard highlights the matching icon.
 */

import { normalizePhone, getWhatsAppHref } from "@/lib/utils";
import { instagramUrl } from "@/lib/social-links";

// MEH-2753: keys only. The labels that used to sit here had no reader; the
// words a person sees are `contact_cta.<key>` in messages/{he,en}.json.
export const CONTACT_METHODS = [
  { key: "whatsapp" },
  { key: "phone" },
  { key: "website" },
  { key: "email" },
  // MEH-296: instagram becomes selectable as primary; facebook + external_order new.
  { key: "instagram" },
  { key: "facebook" },
  { key: "external_order" },
];

/** The DECLARED method — "whatsapp" for old rows (NULL column). Internal. */
function declaredMethod(producer) {
  const m = producer?.primary_contact_method;
  return CONTACT_METHODS.some((c) => c.key === m) ? m : "whatsapp";
}

/**
 * The href for one method, or null when the producer lacks the field that
 * method needs. Pure; the method is given, not read from the producer.
 */
function hrefFor(method, producer, waMessage = "") {
  switch (method) {
    case "whatsapp": {
      const digits = normalizePhone(producer.phone);
      if (!digits) return null;
      // MEH-1559 converged the referral prefill on "הגעתי דרך מהמקור"
      // (MEH-1535). MEH-2753 did the i18n follow-up: the text is
      // `contact_cta.wa_greeting`, passed in by the caller.
      return getWhatsAppHref(digits, waMessage);
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
    case "instagram":
      // MEH-296 stripped the leading "@" here; MEH-2174 moved that rule into
      // lib/social-links.js so this surface, ContactCard and the outreach
      // table cannot drift apart. Returns null when there is no handle.
      return instagramUrl(producer.instagram);
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

/**
 * MEH-2836: the ONE resolver for "which channel does the contact button use".
 * The declared method if the business has the data it needs; else the first
 * method in CONTACT_METHODS order that has data; else null (no contact detail
 * at all). Before this, a business with no WhatsApp number (the default for
 * old rows) got NO button at all, even with a website, email or Instagram —
 * «מעדניית בן שמן» on staging showed a sticky bar with only its rating.
 * @returns {string|null}
 */
export function getResolvedMethod(producer) {
  if (!producer) return null;
  const declared = declaredMethod(producer);
  if (hrefFor(declared, producer)) return declared;
  const fallback = CONTACT_METHODS.find((c) => hrefFor(c.key, producer));
  return fallback ? fallback.key : null;
}

/**
 * The channel the contact button uses — the RESOLVED method (MEH-2836), so the
 * label, href, CTA variant, external flag and the WhatsApp beacon/unlock all
 * agree. With no contact detail at all it falls back to the declared method
 * (whatsapp for old rows); the href is null then, and callers hide the button.
 */
export function getPrimaryMethod(producer) {
  return getResolvedMethod(producer) ?? declaredMethod(producer);
}

/**
 * Build the href for the primary CTA (the resolved method). Returns null when
 * the producer has no contact detail at all — caller hides the button.
 *
 * MEH-2753: `waMessage` is the WhatsApp prefill, already translated by the
 * caller — `t("contact_cta.wa_greeting", { name })`. This helper stays pure
 * (no React, no i18n). Callers that only test whether a CTA exists may omit it.
 */
export function getPrimaryContactHref(producer, waMessage = "") {
  const method = getResolvedMethod(producer);
  return method ? hrefFor(method, producer, waMessage) : null;
}

/**
 * CTA label for the primary contact button. `t` is a ROOT-namespace
 * translator; the words are `contact_cta.<method>` (MEH-2753). Copy history,
 * kept with the strings' owners: MEH-2634 named the WhatsApp channel;
 * MEH-76 chunk 2 made website read «להזמנה באתר»; MEH-296 locked the
 * instagram / facebook / external_order lines.
 */
export function getPrimaryContactLabel(producer, t) {
  return t(`contact_cta.${getPrimaryMethod(producer)}`);
}

/**
 * True when WhatsApp is the channel the contact button uses (MEH-2154). Since
 * MEH-2836 that is the RESOLVED method: a business that declared WhatsApp but
 * has no number gets no WhatsApp chips (they could not have worked anyway).
 *
 * Lives here, beside getPrimaryMethod / isPrimaryExternal, because it is a
 * statement about the contact channel and this module is the single owner of
 * that fact — a second copy in a component is the "two parallel mechanisms"
 * smell (workflow.md § Smell #1).
 *
 * DO NOT reimplement as `producer.primary_contact_method === "whatsapp"`. That
 * strict form answers a different question: `primary_contact_method` is
 * `Column(String(20), default="whatsapp")` (backend models.py:71), a
 * Python-side default, so a row that predates the column or was written around
 * the ORM reads NULL — and NULL has always BEHAVED as WhatsApp everywhere,
 * because every consumer goes through getPrimaryMethod's fallback above. The
 * strict comparison would silently strip the WhatsApp chips from those rows.
 */
export function isWhatsAppPrimary(producer) {
  return getPrimaryMethod(producer) === "whatsapp";
}

/** True when the primary CTA will open in a new tab (not wa.me/tel/mailto). */
export function isPrimaryExternal(producer) {
  // MEH-296: instagram/facebook/external_order also open in a new tab.
  return ["website", "instagram", "facebook", "external_order"].includes(
    getPrimaryMethod(producer)
  );
}
