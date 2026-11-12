"use client";

import { getCtaVariant } from "@/components/ContactCtaVariants";
import { isExternalMethod } from "@/lib/contact-method";
import { withReferralParams } from "@/lib/utils";

/**
 * MEH-2988: the organizer page's preferred contact channel, drawn exactly like
 * the business page's primary button — the same icon + colour per method
 * (ContactCtaVariants, MEH-2813) and the same `contact_cta.<method>` label the
 * server page passes in. Before this the organizer page showed a bare pill
 * reading «וואטסאפ», with no icon and no verb.
 *
 * A client component only because the variant map lives in a client module;
 * the page itself stays a server component.
 */
// REUSES: frontend/components/PrimaryContactButton.jsx — variant icon + class.
export default function OrganizerPrimaryContact({ channel, label }) {
  const variant = getCtaVariant(channel.key);
  const Icon = variant.Icon;
  // Same tab / referral rules as the business button (PrimaryContactButton):
  // WhatsApp, phone and email open in place; a website keeps the referrer and
  // carries the referral UTM (MEH-1525) so the organizer's analytics credits us.
  const external = isExternalMethod(channel.key);
  const isWebsite = channel.key === "website";
  const href = isWebsite ? withReferralParams(channel.href) : channel.href;
  return (
    <a
      href={href}
      {...(external
        ? { target: "_blank", rel: isWebsite ? "noopener" : "noopener noreferrer" }
        : {})}
      data-testid={`organizer-contact-${channel.key}`}
      data-primary="true"
      className={`inline-flex items-center justify-center gap-2 min-h-touch px-5 rounded-xl font-semibold transition focus-visible:ring-2 ${variant.className}`}
    >
      <Icon size={20} />
      {label}
    </a>
  );
}
