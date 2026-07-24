import { useTranslations } from "next-intl";
import {
  Star,
  WhatsappLogo,
  Phone,
  Globe,
  EnvelopeSimple,
  InstagramLogo,
  FacebookLogo,
  Receipt,
} from "@phosphor-icons/react";

import { getPrimaryContactHref, getPrimaryContactLabel, getPrimaryMethod, isPrimaryExternal } from "@/lib/contact-method";
import { withReferralParams } from "@/lib/utils";

import { pingWhatsAppBeacon, markWhatsAppClickedLocal } from "@/lib/contact-tracking";

// MEH-1411: the sticky CTA carried a label with no icon while the inline CTA
// showed one. Mirror PrimaryContactButton.jsx's per-method icon so the sticky
// bar matches the inline button — same WhatsappLogo (weight="fill") for the
// common whatsapp case, method-appropriate icon otherwise. Colors are owned by
// the className fork below (btn-whatsapp keeps #25D366) — icon only, no recolor.
// REUSES: components/PrimaryContactButton.jsx VARIANTS icon set.
const METHOD_ICON = {
  whatsapp: WhatsappLogo,
  phone: Phone,
  website: Globe,
  email: EnvelopeSimple,
  instagram: InstagramLogo,
  facebook: FacebookLogo,
  external_order: Receipt,
};

/**
 * Mobile-only sticky bar that slides in from the bottom when the
 * inline CTA scrolls out of view. Verbatim move from
 * ProducerDetail.jsx:834-897.
 *
 * Visibility is driven by `isBarVisible` from useStickyBar — the
 * CSS transform translate-y toggles between 0 (visible) and 100%
 * (hidden). Animation timing (200ms ease-out enter / 150ms ease-in
 * exit) and z-index (598, below CookieBanner@599 and BottomNav@1000)
 * are preserved exactly.
 *
 * Beacon dedup applied to this onClick. UNLIKE the ContactCard CTA
 * (mounted inline on mobile + in the desktop sidebar), this site fires
 * pingWhatsAppBeacon WITHOUT calling markWhatsAppClickedLocal — see
 * TODO below.
 */
export default function StickyContactBar({
  producer,
  isVacation,
  isBarVisible,
}) {
  const t = useTranslations();
  // MEH-1411: per-method icon for the sticky CTA (matches the inline button).
  const CtaIcon = METHOD_ICON[getPrimaryMethod(producer)] || WhatsappLogo;
  // MEH-1525: mirror PrimaryContactButton — a business-website sticky CTA
  // carries referral UTM and drops `noreferrer` (keeps `noopener`). Website
  // method only; every other method's href + rel stay exactly as before.
  const isWebsite = getPrimaryMethod(producer) === "website";
  const rawHref = getPrimaryContactHref(producer);
  const href = isWebsite ? withReferralParams(rawHref) : rawHref;
  return (
    <div
      // MEH-76 chunk 3: border hex literal -> border-border token class; the
      // soft lift shadow stays inline (no shadow token exists; rgba, not hex).
      // MEH-1146 chunk A: md:hidden -> lg:hidden so the bar covers the whole
      // single-column range (mobile + tablet) that mounts the inline
      // ContactCard; the desktop sidebar card takes over at lg+.
      className="lg:hidden fixed bottom-16 inset-x-0 z-[598] bg-white border-t border-border"
      style={{
        // MEH-1146 chunk A: the hidden state adds the bottom-16 offset (4rem)
        // to the slide so the bar clears the viewport entirely. translateY(100%)
        // alone only shifts it down by its own height and leaves it parked in
        // the bottom-16 gap (previously hidden only by BottomNav's z-1000
        // occlusion) — which broke the "exactly one primary action per viewport"
        // invariant. Keep this 4rem in sync with the bottom-16 class above.
        transform: isBarVisible ? "translateY(0)" : "translateY(calc(100% + 4rem))",
        transition: isBarVisible ? "transform 200ms ease-out" : "transform 150ms ease-in",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
        opacity: isVacation ? 0.85 : 1,
      }}
      // MEH-1333: when parked off-screen the bar must be non-focusable, not just
      // aria-hidden — a bare aria-hidden left the sticky CTA tabbable inside a
      // hidden subtree (axe aria-hidden-focus, serious). `inert` removes the whole
      // subtree from tab order AND the a11y tree (implies aria-hidden), so the
      // rule can't fire and the CTA is truly unreachable while hidden. React
      // 18.3.1 has no first-class `inert` prop → string idiom ("" = present,
      // undefined = removed).
      inert={!isBarVisible ? "" : undefined}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Social proof — hidden if < 3 reviews. MEH-76 chunk 1: the vacation
            notice that used to replace it was the page's THIRD vacation
            surface — removed (single banner lives in ProducerHeader). The
            CTA label below still carries the honest expectation line. */}
        {producer.reviews_count >= 3 ? (
          <div className="shrink-0 text-[11px] text-fg-muted leading-tight">
            {/* MEH-76: gold hex -> accent token, emoji star -> Phosphor,
                rating digits bidi-isolated (.numeric, MEH-763 convention). */}
            <div className="font-bold text-accent inline-flex items-center gap-0.5">
              <Star size={11} weight="fill" aria-hidden="true" />
              <span className="numeric">{Number(producer.avg_rating).toFixed(1)}</span>
            </div>
            <div>{t("producer.detail.header.review_count", { count: producer.reviews_count })}</div>
          </div>
        ) : null}
        {/* Primary CTA */}
        {href && (
          <a
            href={href}
            data-testid="sticky-primary-cta"
            {...(isPrimaryExternal(producer)
              ? { target: "_blank", rel: isWebsite ? "noopener" : "noopener noreferrer" }
              : {})}
            // MEH-1426: TODO resolved — the sticky bar now matches the ContactCard
            // CTA. A WhatsApp primary click both attributes (pingWhatsAppBeacon) and
            // unlocks the review form (markWhatsAppClickedLocal, localStorage
            // wa_clicked_<id>). Invariant: every WhatsApp click = attribution +
            // unlock; a non-WhatsApp primary fires neither.
            onClick={() => {
              if (getPrimaryMethod(producer) === "whatsapp") {
                pingWhatsAppBeacon(producer.id);
                markWhatsAppClickedLocal(producer.id);
              }
            }}
            // MEH-76 chunk 1: the vacation pale-green CTA fork was an ADR-019
            // violation (state-color fill + raw hex). The CTA keeps its normal
            // method-driven color — the whole bar is already dimmed via opacity.
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-md font-medium text-sm transition ${
              getPrimaryMethod(producer) === "whatsapp"
                ? "btn-whatsapp"
                : getPrimaryMethod(producer) === "phone"
                ? "bg-primary text-white hover:bg-primary-dark"
                : getPrimaryMethod(producer) === "email"
                ? "bg-primary-dark text-white hover:bg-primary"
                : "bg-white text-text border border-primary hover:bg-green-50"
            }`}
          >
            <CtaIcon size={20} weight="fill" aria-hidden="true" />
            {isVacation ? t("producer.detail.sticky_bar.vacation_msg") : getPrimaryContactLabel(producer)}
          </a>
        )}
      </div>
    </div>
  );
}
