"use client";

import { WhatsappLogo, Phone, Globe, EnvelopeSimple } from "@phosphor-icons/react";
import {
  getPrimaryContactHref,
  getPrimaryContactLabel,
  getPrimaryMethod,
  isPrimaryExternal,
} from "@/lib/contact-method";

/**
 * Primary CTA button on ProducerDetail — color + icon + Hebrew label
 * driven by producer.primary_contact_method (MEH-17).
 *
 * Returns null when the required field is missing so the layout
 * gracefully collapses (backend validation should prevent this).
 */

// Visual config per method. Keeping inline so one change = one diff.
const VARIANTS = {
  whatsapp: {
    Icon: WhatsappLogo,
    className:
      "btn-whatsapp",
  },
  phone: {
    Icon: Phone,
    className:
      "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary/40",
  },
  website: {
    Icon: Globe,
    className:
      "bg-white text-text border border-primary hover:bg-green-50 focus-visible:ring-primary/40",
  },
  email: {
    Icon: EnvelopeSimple,
    className:
      "bg-primary-dark text-white hover:bg-primary focus-visible:ring-primary-dark/40",
  },
};

export default function PrimaryContactButton({ producer, onClick }) {
  const href = getPrimaryContactHref(producer);
  if (!href) return null;

  const method = getPrimaryMethod(producer);
  const variant = VARIANTS[method] || VARIANTS.whatsapp;
  const Icon = variant.Icon;
  const label = getPrimaryContactLabel(producer);
  const external = isPrimaryExternal(producer);

  return (
    <a
      href={href}
      onClick={onClick}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      data-testid="primary-contact-button"
      data-method={method}
      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-[10px] transition font-medium mb-2.5 focus-visible:ring-2 ${variant.className}`}
    >
      <Icon size={20} weight="fill" aria-hidden="true" />
      {label}
    </a>
  );
}
