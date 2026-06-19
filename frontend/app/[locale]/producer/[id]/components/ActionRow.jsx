import { useTranslations } from "next-intl";
import { MapTrifold } from "@phosphor-icons/react";

import PrimaryContactButton from "@/components/PrimaryContactButton";
import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import WhatsAppShareButton from "@/components/WhatsAppShareButton";
import { getPrimaryMethod } from "@/lib/contact-method";

import { markWhatsAppClickedLocal, pingWhatsAppBeacon } from "@/lib/contact-tracking";

/**
 * Mobile inline CTA + the cross-breakpoint action row underneath it.
 * Verbatim layout from ProducerDetail.jsx:425-480.
 *
 * The mobile inline CTA wrapper (`<div ref={inlineCTARef} className="md:hidden mt-4">`)
 * is the IntersectionObserver target for useStickyBar — when it scrolls
 * out of view the sticky mobile bar slides in. Render-order invariant
 * (per Phase 1 risk note): this wrapper must remain the first child
 * inside the main column AFTER ProducerHeader, before the action row.
 *
 * The onClick handler consolidates the three pasted beacon blocks from
 * the pre-refactor file (sites :439, :720, :875). The mobile inline
 * CTA fires beacon AND localStorage write — same as the source. The
 * sticky bar (StickyContactBar.jsx) emits beacon ONLY by design.
 */
export default function ActionRow({
  producer,
  user,
  inlineCTARef,
  shareUrl,
  onShowOnMap,
}) {
  const t = useTranslations();
  return (
    <>
      {/* Mobile inline CTA — IO trigger for StickyContactBar.
          ref={inlineCTARef}: when this exits viewport, the sticky bar slides in.
          md:hidden — desktop sidebar already has the CTA. */}
      <div ref={inlineCTARef} className="md:hidden mt-4">
        <WhatsAppQuestionChips producer={producer} />
        <PrimaryContactButton
          producer={producer}
          onClick={() => {
            if (getPrimaryMethod(producer) === "whatsapp") {
              pingWhatsAppBeacon(producer.id);
            }
            // Mark that this user has contacted via WhatsApp — unlocks review form
            markWhatsAppClickedLocal(producer.id);
          }}
        />
      </div>

      {/* Action row — map + viral share. Shown at all breakpoints.
          Desktop: MapButton moves here from sidebar to reduce sidebar density.
          WhatsAppShareButton is secondary (gray outlined) to avoid green conflict with primary CTA. */}
      <div className="flex flex-wrap gap-2 mt-3">
        {/* MEH-213: map button only for producers with a physical location.
            MEH-76 chunk 2 (S6 .btn-nav): nav-out actions are neutral —
            border-border + primary-dark text, never the primary green that
            competed with the mobile inline CTA right above this row. */}
        {producer.has_physical_location !== false && producer.lat && producer.lng && (
          <button
            type="button"
            onClick={onShowOnMap}
            className="flex items-center justify-center gap-2 border border-border text-primary-dark px-4 min-h-[44px] rounded-md hover:border-primary transition text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={t("producer.detail.action_row.aria.show_on_map")}
          >
            <MapTrifold size={16} />
            {t("producer.detail.action_row.show_on_map")}
          </button>
        )}
        <WhatsAppShareButton producer={producer} url={shareUrl} />
        {/* MEH-49: referral chip — only for logged-in users with a referral code */}
        {user?.referral_code && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(t("producer.detail.action_row.referral_msg", { code: user.referral_code }))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border border-border text-fg-muted px-4 min-h-[44px] rounded-md hover:bg-green-50 transition text-sm font-medium"
          >
            {t("producer.detail.action_row.referral_cta")}
          </a>
        )}
      </div>
    </>
  );
}
