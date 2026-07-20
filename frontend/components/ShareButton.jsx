"use client";

import { useTranslations } from "next-intl";
import { ShareNetwork } from "@phosphor-icons/react";
import { BRAND_NAME } from "@/lib/constants";

/**
 * Variants (MEH-1334):
 *   - "default" — bordered box (legacy surfaces)
 *   - "quiet"   — header quiet-actions row: borderless icon + "שיתוף"
 *   - "overlay" — mobile hero overlay: white circle, icon-only (the share
 *                 affordance's single mobile home; heart moved to actions row)
 */
export default function ShareButton({ url, title, description, city, category, variant = "default" }) {
  const t = useTranslations("share");
  const resolvedTitle = title || t("wa_message_business_fallback");
  const metaSep = t("wa_meta_separator");
  const shareText = [
    t("wa_message_with_meta", { title: resolvedTitle }),
    description ? `${description.slice(0, 80)}...` : "",
    city || category
      ? `${city || ""}${city && category ? metaSep : ""}${category || ""}`
      : "",
    `👉 ${url}`,
  ]
    .filter(Boolean)
    .join("\n");

  // MEH-1290: WhatsApp is the product's viral loop, so when the native share
  // sheet is unavailable (desktop / older browsers) fall back to wa.me with a
  // concise pre-filled message — business-name line + link — instead of a
  // silent clipboard copy. navigator.share stays the primary path on mobile.
  const waText = [t("wa_message_with_meta", { title: resolvedTitle }), `👉 ${url}`]
    .filter(Boolean)
    .join("\n");
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const handleShare = async () => {
    if (!url) return;
    // Native share first (mobile) — its sheet already surfaces WhatsApp among
    // the OS share targets. Return whether it resolves or is cancelled, so a
    // cancelled sheet never force-opens WhatsApp.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: title || BRAND_NAME, text: shareText, url });
      } catch {
        // user cancelled or share failed — do not fall through
      }
      return;
    }
    // No native share (desktop / older browsers) → wa.me fallback.
    window.open(waHref, "_blank", "noopener,noreferrer");
  };

  if (variant === "overlay") {
    return (
      <button
        onClick={handleShare}
        // Mirrors FavoriteButton's gallery circle so the hero corner control
        // swap (heart → share, MEH-1334 decision 6) is visually seamless.
        className="bg-white/95 hover:bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-md hover:scale-105 transition focus-visible:ring-2 focus-visible:ring-primary/40"
        title={t("copy_link")}
        aria-label={t("modal_title")}
      >
        <ShareNetwork size={20} className="text-text" aria-hidden="true" />
      </button>
    );
  }

  if (variant === "quiet") {
    // MEH-1334: header quiet-actions row — borderless icon + locked label
    // "שיתוף"; ≥44px hit-area via min-h + transparent padding (revision-2 #5).
    return (
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 min-h-[44px] py-2 text-[13px] font-medium text-text hover:text-primary rounded transition focus-visible:ring-2 focus-visible:ring-primary/40"
        title={t("copy_link")}
        aria-label={t("modal_title")}
      >
        <ShareNetwork size={17} className="text-primary-dark" aria-hidden="true" />
        {t("quiet_label")}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center justify-center gap-2 bg-white border border-border px-3 py-2 min-h-[44px] min-w-[44px] rounded-[8px] hover:bg-green-50 transition text-sm focus-visible:ring-2 focus-visible:ring-primary/40"
      title={t("copy_link")}
      aria-label={t("modal_title")}
    >
      <ShareNetwork size={16} aria-hidden="true" />
      <span className="hidden sm:inline">{t("trigger")}</span>
    </button>
  );
}
