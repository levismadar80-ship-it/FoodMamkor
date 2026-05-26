import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";

import { optimizeCloudinary } from "@/lib/cloudinary";
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";

/**
 * Desktop mini-popup pinned to the bottom-end corner of the map
 * pane when a producer is selected. Verbatim move of the
 * desktopMiniPopup IIFE from MapClient.jsx:709-738.
 *
 * RTL: preserves the source's `// rtl-ok: map overlay, physically
 * pinned to corner` annotation and the physical `bottom-4 right-4`
 * positioning. The popup pins to the bottom-RIGHT in both LTR and
 * RTL because it overlays the map canvas, which is geographically
 * fixed (north up, east right) regardless of page direction.
 *
 * Z-index: z-[600] (preserved verbatim — bottom-sheet token per
 * .claude/rules/rtl.md → "Map z-index tokens").
 *
 * Beacon dedup: the pre-refactor inline `try { navigator.sendBeacon?
 * (…) } catch {}` (was at :730) is replaced with
 * pingWhatsAppBeacon(p.id) from the shared lib. The source site
 * never wrote `wa_clicked_<id>` localStorage — preserved.
 */
export default function DesktopMiniPopup({ selectedProducer, onClose }) {
  const t = useTranslations();
  if (!selectedProducer) return null;
  const p = selectedProducer;
  const imageUrl = optimizeCloudinary(p.images?.[0]);
  return (
    // eslint-disable-next-line no-restricted-syntax -- rtl-ok: map overlay, physically pinned to corner
    <div className="absolute bottom-4 right-4 z-[600] bg-white rounded-[16px] border border-border shadow-[0_4px_24px_rgba(0,0,0,0.12)] w-[300px] overflow-hidden">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={p.name || ""} className="w-full h-[100px] object-cover" />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-headline font-bold text-site-text line-clamp-1" style={{ fontSize: "15px" }}>{p.name}</h3>
          <button type="button" onClick={onClose} className="shrink-0 w-7 h-7 rounded-full hover:bg-green-50 flex items-center justify-center text-fg-muted" aria-label={t("common.aria.close")}>
            <X size={14} weight="bold" />
          </button>
        </div>
        <p className="text-xs text-fg-muted mt-0.5">
          {[p.categories?.[0]?.name, p.city, p.starting_price_label || p.price_range].filter(Boolean).join(" · ")}
        </p>
        {normalizePhone(p.phone) && (
          <a href={getWhatsAppHref(normalizePhone(p.phone), t("map.popup.whatsapp_greeting", { name: p.name || "" }))} target="_blank" rel="noopener noreferrer" onClick={() => pingWhatsAppBeacon(p.id)} className="btn-whatsapp mt-2 w-full flex items-center justify-center gap-2 rounded-[8px] py-2 font-medium text-sm">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41z"/></svg>
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
