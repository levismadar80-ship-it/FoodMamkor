"use client";

import { useTranslations } from "next-intl";
import {
  getPrimaryContactHref,
  getPrimaryContactLabel,
  getPrimaryMethod,
  isPrimaryExternal,
} from "@/lib/contact-method";
import { withReferralParams } from "@/lib/utils";
import { getCtaVariant } from "@/components/ContactCtaVariants";

/**
 * Primary CTA button on ProducerDetail — color + icon + Hebrew label
 * driven by producer.primary_contact_method (MEH-17).
 *
 * Returns null when the required field is missing so the layout
 * gracefully collapses (backend validation should prevent this).
 */

// MEH-2813: colour + icon per method live in ContactCtaVariants.jsx, shared
// with the sticky bar so the two CTAs cannot drift apart again.

export default function PrimaryContactButton({ producer, onClick }) {
  const t = useTranslations();
  const method = getPrimaryMethod(producer);
  // MEH-2753: label + WhatsApp prefill come from messages (contact_cta.*).
  const rawHref = getPrimaryContactHref(
    producer,
    t("contact_cta.wa_greeting", { name: producer?.name || "" }),
  );
  if (!rawHref) return null;

  // MEH-1525: a business-website CTA carries referral UTM and drops
  // `noreferrer` (keeps `noopener`) so the owner's analytics attributes the
  // click to mehamakor. Website method only — social / external_order links
  // and their `rel` are untouched.
  const isWebsite = method === "website";
  const href = isWebsite ? withReferralParams(rawHref) : rawHref;

  const variant = getCtaVariant(method);
  const Icon = variant.Icon;
  const label = getPrimaryContactLabel(producer, t);
  const external = isPrimaryExternal(producer);

  return (
    <a
      href={href}
      onClick={onClick}
      {...(external
        ? { target: "_blank", rel: isWebsite ? "noopener" : "noopener noreferrer" }
        : {})}
      data-testid="primary-contact-button"
      data-method={method}
      className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl transition font-semibold mb-2.5 focus-visible:ring-2 ${variant.className}`}
    >
      <Icon size={20} />
      {label}
    </a>
  );
}
