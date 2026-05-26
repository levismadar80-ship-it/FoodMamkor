import { useTranslations } from "next-intl";

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
  vacationReturnLabel,
  isBarVisible,
}) {
  const t = useTranslations();
  return (
    <div
      className="md:hidden fixed bottom-16 inset-x-0 z-[598]"
      style={{
        transform: isBarVisible ? "translateY(0)" : "translateY(100%)",
        transition: isBarVisible ? "transform 200ms ease-out" : "transform 150ms ease-in",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "white",
        borderTop: "1px solid #DDD5C8",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
        opacity: isVacation ? 0.85 : 1,
      }}
      aria-hidden={!isBarVisible}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Social proof — hidden if < 3 reviews; replaced by vacation notice */}
        {isVacation ? (
          <span className="text-[11px] text-fg-muted shrink-0">🌿 {vacationReturnLabel}</span>
        ) : producer.reviews_count >= 3 ? (
          <div className="shrink-0 text-[11px] text-fg-muted leading-tight">
            <div className="font-bold text-[#8B6914]">
              ⭐ {Number(producer.avg_rating).toFixed(1)}
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
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[10px] font-medium text-sm transition ${
              isVacation
                ? "bg-[#6EAF8A] text-white"
                : getPrimaryMethod(producer) === "whatsapp"
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
