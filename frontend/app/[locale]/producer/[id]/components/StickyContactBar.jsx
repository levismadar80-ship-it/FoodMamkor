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
 * Beacon dedup applied to block #3's onClick (:870-879). UNLIKE
 * blocks #1 + #2 (ActionRow + ContactSidebar), this site fires
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
      className="md:hidden fixed bottom-16 inset-x-0 z-[598] bg-white border-t border-border"
      style={{
        transform: isBarVisible ? "translateY(0)" : "translateY(100%)",
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
            {...(isPrimaryExternal(producer)
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            // TODO(MEH-XXX): sticky bar intentionally omits markWhatsAppClickedLocal —
            // review-form unlock does not trigger from this path. Verify if intentional.
            // The inline CTA (ActionRow) and sidebar CTA (ContactSidebar) both write
            // localStorage.wa_clicked_<id>; this site does not. Source pattern
            // preserved from ProducerDetail.jsx:870-879 by Q1 resolution C in PR2 plan.
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
