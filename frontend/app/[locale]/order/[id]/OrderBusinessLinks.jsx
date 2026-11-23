// @ts-check
"use client";

/**
 * Module:   OrderBusinessLinks
 * Purpose:  MEH-3755 — on the buyer's order page: the business's name as a
 *           link to its page, its contact button (the channel it chose), and
 *           Waze / Google Maps for the pickup address.
 * Touches:  GET /producers/{id} (public; the order carries only the id).
 * Does NOT: show the order itself (OrderStatusClient.jsx), or decide which
 *           channel a business uses (lib/contact-method.js), or build a nav URL
 *           (lib/nav-links.js). A business whose page cannot be read (a 404 for
 *           a hidden or seeded business, a bad body) shows nothing here; the
 *           rest of the order page is unchanged.
 * Related:  app/[locale]/producer/[id]/components/StickyContactBar.jsx (the
 *           same contact href + label on the business page),
 *           components/NavAppGlyphs.jsx AddressNavLinks.
 * History:  MEH-3755 (creation).
 */

import { useTranslations } from "next-intl";
import { Storefront } from "@phosphor-icons/react";

import { Link } from "@/i18n/navigation";
import { AddressNavLinks } from "@/components/NavAppGlyphs";
import { OrderBusinessSchema } from "@/lib/api-responses";
import { getPrimaryContactHref, getPrimaryContactLabel, getPrimaryMethod, isPrimaryExternal } from "@/lib/contact-method";
import { trackChannelClick } from "@/lib/contact-tracking";
import { addressNavLinks } from "@/lib/nav-links";
import { producerPath } from "@/lib/producer-path";
import { useApi } from "@/lib/use-api";

// Rule 19: a body that does not parse is no business — the block hides.
const parseBusiness = (/** @type {unknown} */ data) => {
  const parsed = OrderBusinessSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

// Same attributes the business page puts on an outbound contact link.
const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" };

/** @param {{ producer: any }} props */
function ContactButton({ producer }) {
  const tr = useTranslations();
  const href = getPrimaryContactHref(producer, tr("contact_cta.wa_greeting", { name: producer.name || "" }));
  if (!href) return null;
  const method = getPrimaryMethod(producer);
  return (
    <a
      href={href}
      {...(isPrimaryExternal(producer) ? EXTERNAL : {})}
      onClick={() => trackChannelClick(producer.id, method)}
      className="inline-flex items-center justify-center min-h-touch px-4 rounded-full bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/20 focus-ring"
      data-testid="order-contact"
    >
      {getPrimaryContactLabel(producer, tr)}
    </a>
  );
}

/** @param {{ producerId: string, pickupAddress?: string | null }} props */
export default function OrderBusinessLinks({ producerId, pickupAddress = null }) {
  const { data: producer } = useApi(producerId ? `/producers/${producerId}` : null, {
    transform: parseBusiness,
    view: "order-business",
  });
  const navLinks = pickupAddress ? addressNavLinks(pickupAddress) : null;
  const nav = navLinks ? <AddressNavLinks links={navLinks} testId="order-nav" /> : null;
  if (!producer) return nav;
  const href = producerPath(producer);
  return (
    <div className="rounded-lg border border-border bg-surface" data-testid="order-business">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {href ? (
          <Link href={href} className="inline-flex items-center gap-2 min-h-touch font-semibold text-primary hover:underline focus-ring" data-testid="order-business-link">
            <Storefront size={20} aria-hidden="true" />
            {producer.name}
          </Link>
        ) : (
          <span className="font-semibold text-text">{producer.name}</span>
        )}
        <ContactButton producer={producer} />
      </div>
      {nav}
    </div>
  );
}
