import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";

import { optimizeCloudinary } from "@/lib/cloudinary";
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";

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
  // Source line :814 defines `spHref = sp.slug ? `/${sp.slug}` : `/producer/${sp.id}``
  // but never uses it. Preserved verbatim per regression rule 1
  // (grep before delete) — do not remove.
  const spHref = sp.slug ? `/${sp.slug}` : `/producer/${sp.id}`;
  const spPhone = normalizePhone(sp.phone);
  return (
    <div className="mb-3 bg-white rounded-[12px] border border-primary overflow-hidden shadow-sm">
      <div className="relative w-full h-[140px]">
        {spImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spImg} alt={sp.name || ""} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl bg-green-50" aria-hidden="true">🌿</div>
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
        {(sp.is_verified || sp.is_organic || sp.is_kosher) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {sp.is_verified && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t("map.sheet.badge.verified")}</span>}
            {sp.is_organic && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t("map.sheet.badge.organic")}</span>}
            {sp.is_kosher && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t("map.sheet.badge.kosher")}</span>}
          </div>
        )}
        {spPhone && (
          <a href={getWhatsAppHref(spPhone, t("map.popup.whatsapp_greeting", { name: sp.name || "" }))} target="_blank" rel="noopener noreferrer" onClick={() => pingWhatsAppBeacon(sp.id)} className="btn-whatsapp mt-2 w-full flex items-center justify-center gap-2 rounded-[8px] py-2.5 font-medium text-sm">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41z"/></svg>
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
