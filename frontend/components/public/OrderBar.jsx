// @ts-check
"use client";
/**
 * Module:   OrderBar
 * Purpose:  The bar at the bottom of a business page once the buyer picked at
 *           least one product: «להזמנה · {count} פריטים · {total} ₪», which
 *           opens the order sheet. On a phone it keeps the business's own
 *           contact button beside it as a round icon, so picking a product
 *           never hides the way to ask a question.
 * Does NOT: decide what can be ordered (lib/order-cart.js) or send anything
 *           (the order sheet does). It replaces StickyContactBar while it
 *           shows; ProducerDetail renders one or the other.
 * Related:  app/[locale]/producer/[id]/components/StickyContactBar.jsx (the
 *           contact link and its tracking, reused here unchanged)
 * History:  MEH-3216 stage 5b (creation; placement A, Sapir 14/11)
 */

import { useTranslations } from "next-intl";

import { getCtaVariant } from "@/components/ContactCtaVariants";
import { getPrimaryContactHref, getPrimaryContactLabel, getPrimaryMethod, isPrimaryExternal } from "@/lib/contact-method";
import { trackPrimaryCtaClick } from "@/lib/contact-tracking";
import { shekelsText } from "@/lib/product-orders";
import { withReferralParams } from "@/lib/utils";

/**
 * @param {{
 *   producer: any,
 *   count: number,
 *   totalAgorot: number,
 *   onOpen: () => void,
 * }} props
 */
export default function OrderBar({ producer, count, totalAgorot, onOpen }) {
  const t = useTranslations();
  if (count < 1) return null;
  return (
    <div
      className="vv-pin fixed bottom-0 inset-x-0 z-sticky-bar flex justify-center gap-3 px-[14px] pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      data-testid="order-bar"
      data-chat-hide=""
    >
      <ContactCircle producer={producer} t={t} />
      <button
        type="button"
        onClick={onOpen}
        data-testid="order-bar-open"
        className="pointer-events-auto w-full max-w-md h-12 rounded-full bg-action-primary hover:bg-action-primary-hover text-white font-medium text-base shadow-lg focus-ring"
      >
        {t("producer.detail.order_cart.bar", { count, total: shekelsText(totalAgorot) })}
      </button>
    </div>
  );
}

/** The business's primary contact as a 48px round icon, phone only. */
function ContactCircle({ producer, t }) {
  const method = getPrimaryMethod(producer);
  const raw = getPrimaryContactHref(producer, t("contact_cta.wa_greeting", { name: producer?.name || "" }));
  if (!raw) return null;
  const isWebsite = method === "website";
  const variant = getCtaVariant(method);
  const Icon = variant.Icon;
  return (
    <a
      href={isWebsite ? withReferralParams(raw) : raw}
      aria-label={getPrimaryContactLabel(producer, t)}
      {...(isPrimaryExternal(producer)
        ? { target: "_blank", rel: isWebsite ? "noopener" : "noopener noreferrer" }
        : {})}
      onClick={() => trackPrimaryCtaClick(producer.id, method)}
      data-testid="order-bar-contact"
      className="lg:hidden pointer-events-auto shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-surface-card border border-action-primary text-action-primary shadow-lg focus-ring"
    >
      <Icon size={20} aria-hidden="true" />
    </a>
  );
}
