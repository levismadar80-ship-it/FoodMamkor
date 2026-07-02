import { useTranslations } from "next-intl";
import { Leaf, X, WhatsappLogo, Phone, Globe, EnvelopeSimple, SealCheck, ArrowRight } from "@phosphor-icons/react";

import { optimizeCloudinary } from "@/lib/cloudinary";
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";
import {
  getPrimaryContactHref,
  getPrimaryMethod,
  getPrimaryContactLabel,
  isPrimaryExternal,
} from "@/lib/contact-method";

/**
 * Pinned-card variant of <DesktopMiniPopup/> for the mobile bottom
 * sheet. Verbatim move of the pinned-card IIFE that lived inside
 * <MapBottomSheet> in MapClient.jsx (was source :810-852, last
 * inline at MapClient.jsx commit 11 step :289-339 before this move).
 *
 * RTL: preserves the source's `rtl-ok: map overlay close button,
 * physically positioned` annotation and the physical `top-2 right-2`
 * positioning. The close button overlays the producer image and
 * pins to the top-RIGHT in both LTR and RTL because the overlay is
 * geometrically fixed to the image (top-right corner is a visual
 * idiom regardless of page direction).
 *
 * Beacon dedup: the WhatsApp CTA uses pingWhatsAppBeacon(sp.id)
 * from the shared lib (was added inline in commit 10). The /map
 * surface is beacon-only by design — no localStorage write at
 * this site, matching the asymmetry pattern documented in
 * StickyContactBar.jsx (PR2) + DesktopMiniPopup.jsx (PR3 step 8).
 *
 * Plan note: the user's commit-11b spec listed `Props: { selectedProducer }`
 * — adding `onClose` here as a callback prop because the close button
 * needs to clear `selectedProducer` upstream (the source line did
 * `setSelectedProducer(null)`). A single-prop component would force a
 * Context or imperative-ref escape hatch; an onClose callback is the
 * minimal extension that preserves source behavior.
 */
export default function MobileSheetSelectedCard({ selectedProducer, onClose }) {
  const t = useTranslations();
  if (!selectedProducer) return null;
  const sp = selectedProducer;
  const spImg = optimizeCloudinary(sp.images?.[0]);
  // MEH-826: full-profile fallback href (now used when no primary CTA href).
  const spHref = sp.slug ? `/${sp.slug}` : `/producer/${sp.id}`;
  // MEH-826: dynamic primary CTA — mirrors MapProducerCard.jsx contact-method wiring.
  const primaryHref = getPrimaryContactHref(sp);
  const primaryMethod = getPrimaryMethod(sp);
  const ctaExternal = primaryMethod === "whatsapp" || isPrimaryExternal(sp);
  const CtaIcon =
    { whatsapp: WhatsappLogo, phone: Phone, website: Globe, email: EnvelopeSimple }[primaryMethod] ||
    WhatsappLogo;
  return (
    <div className="mb-3 bg-surface-floating rounded-md border border-primary">
      {/* MEH-824: clip moved from the card root to the image wrapper so the
          card root is NOT a scroll container — required for the sticky CTA
          below to bind to the sheet's scroll area, not the card. */}
      <div className="relative w-full h-[140px] overflow-hidden rounded-t-md">
        {spImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spImg} alt={sp.name || ""} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-green-50" aria-hidden="true"><Leaf size={40} className="text-primary/40" /></div>
        )}
        {spImg && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }} />
        )}
        {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: map overlay close button, physically positioned */}
        <button type="button" onClick={onClose} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-fg-muted" aria-label={t("common.aria.close")}>
          <X size={14} weight="bold" />
        </button>
      </div>
      <div className="p-3">
        <h3 className="font-headline-md font-bold text-text line-clamp-1" style={{ fontSize: "18px" }}>{sp.name}</h3>
        <p className="text-[13px] text-fg-muted mt-0.5">{sp.city}{sp.categories?.[0]?.name ? ` · ${sp.categories[0].name}` : ""}</p>
        {/* MEH-826: removed dead is_organic/is_kosher bindings (payload uses
            organic_certified/kosher; design has no dietary badge here). */}
        {sp.verification_tier === "verified" && ( // MEH-766 ch1: doc-verification tier
          <div className="flex flex-wrap gap-1 mt-1.5">
            {/* MEH-943: glyph-LOCK — raw ✓ stripped from he.json value; canonical SealCheck (BadgeRow.jsx:130) rendered inline instead. */}
            <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full"><SealCheck size={11} aria-hidden="true" />{t("map.sheet.badge.verified")}</span>
          </div>
        )}
        {/* MEH-824 sticky + min-h-[44px] preserved. MEH-826: CTA is now dynamic
           per primary_contact_method; null href → fall back to the full-profile
           link (mirrors MapProducerCard.jsx). */}
        {primaryHref ? (
          <a
            href={primaryHref}
            target={ctaExternal ? "_blank" : undefined}
            rel={ctaExternal ? "noopener noreferrer" : undefined}
            onClick={() => { if (primaryMethod === "whatsapp") pingWhatsAppBeacon(sp.id); }}
            aria-label={getPrimaryContactLabel(sp)}
            className={`${primaryMethod === "whatsapp" ? "btn-whatsapp" : "bg-primary text-white"} sticky bottom-0 z-10 mt-2 w-full flex items-center justify-center gap-2 rounded-sm py-2.5 min-h-[44px] font-medium text-sm`}
          >
            <CtaIcon size={16} weight="fill" aria-hidden="true" />
            {getPrimaryContactLabel(sp)}
          </a>
        ) : (
          <a
            href={spHref}
            className="bg-primary text-white sticky bottom-0 z-10 mt-2 w-full flex items-center justify-center gap-2 rounded-sm py-2.5 min-h-[44px] font-medium text-sm"
          >
            {t("map.producer_card.full_profile")}
            {/* MEH-990: raw → dingbat → Phosphor ArrowRight; rtl:rotate-180 = reading-forward in he (MEH-938 pattern) */}
            <ArrowRight size={16} weight="bold" aria-hidden="true" className="rtl:rotate-180" />
          </a>
        )}
      </div>
    </div>
  );
}
