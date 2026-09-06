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
import { INERT_PRESENT } from "@/lib/inert-attr";

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
      //
      // MEH-2148: flush to the viewport edge. The old offset was a hardcoded
      // twin of the full-width nav band that existed when MEH-20 wrote it; the
      // pill redesign (MEH-789) replaced that band, and MEH-2148's gate now
      // unmounts the pill on business pages entirely — so on every surface that
      // mounts this bar there is nothing below it to clear, and the offset was
      // rendering as a strip of dead page showing under the CTA. Measured at
      // 375px before the change: bar bottom 748, viewport 812, 64px of gap.
      className="lg:hidden fixed bottom-0 inset-x-0 z-[598] bg-white border-t border-border"
      data-testid="sticky-contact-bar"
      style={{
        // MEH-2148: with the bar flush, its own height is the whole distance it
        // has to travel, so the plain slide clears the viewport. The previous
        // form added the offset above on top, and that extra term is now not
        // just unnecessary but wrong -- it would park the bar a bar-height BELOW
        // the fold and make the 150ms exit visibly overshoot.
        transform: isBarVisible ? "translateY(0)" : "translateY(100%)",
        transition: isBarVisible ? "transform 200ms ease-out" : "transform 150ms ease-in",
        // MEH-2148: this was always here and was always inert -- the bar sat
        // above the home indicator, so there was nothing to inset for. Flush to
        // the edge it starts doing its job: it keeps the CTA off the indicator.
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
        opacity: isVacation ? 0.85 : 1,
      }}
      // MEH-1333: when parked off-screen the bar must be non-focusable, not just
      // aria-hidden — a bare aria-hidden left the sticky CTA tabbable inside a
      // hidden subtree (axe aria-hidden-focus, serious). `inert` removes the whole
      // subtree from tab order AND the a11y tree (implies aria-hidden), so the
      // rule can't fire and the CTA is truly unreachable while hidden.
      // MEH-2253: the value that means "present" differs between the React in
      // vitest (18.3.1 → "") and the React Next ships the page with (19.x →
      // true); the old `""` idiom was a silent no-op in the browser. The choice
      // lives in lib/inert-attr.js and is tested against both renderers.
      inert={!isBarVisible ? INERT_PRESENT : undefined}
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
