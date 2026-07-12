import { useTranslations } from "next-intl";
import { Star } from "@phosphor-icons/react";

import { getPrimaryContactHref, getPrimaryContactLabel, getPrimaryMethod, isPrimaryExternal } from "@/lib/contact-method";

import { pingWhatsAppBeacon } from "@/lib/contact-tracking";

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
      aria-hidden={!isBarVisible}
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
        {getPrimaryContactHref(producer) && (
          <a
            href={getPrimaryContactHref(producer)}
            data-testid="sticky-primary-cta"
            {...(isPrimaryExternal(producer)
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            // TODO(MEH-XXX): sticky bar intentionally omits markWhatsAppClickedLocal —
            // review-form unlock does not trigger from this path. Verify if intentional.
            // The ContactCard CTA (inline + sidebar) writes localStorage.wa_clicked_<id>;
            // this site does not. Source pattern preserved from ProducerDetail.jsx:870-879
            // by Q1 resolution C in PR2 plan.
            onClick={() => {
              if (getPrimaryMethod(producer) === "whatsapp") {
                pingWhatsAppBeacon(producer.id);
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
            {isVacation ? t("producer.detail.sticky_bar.vacation_msg") : getPrimaryContactLabel(producer)}
          </a>
        )}
      </div>
    </div>
  );
}
