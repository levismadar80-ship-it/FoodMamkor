"use client";

import { useTranslations } from "next-intl";
import { ShareNetwork } from "@phosphor-icons/react";
import { BRAND_NAME } from "@/lib/constants";
import { labelInName } from "@/lib/label-in-name";
import Button from "@/components/ui/Button";

/**
 * Variants (MEH-1334):
 *   - "default" — bordered box (legacy surfaces)
 *   - "quiet"   — header quiet-actions row: borderless icon + "שיתוף"
 *   - "overlay" — mobile hero overlay: white circle, icon-only (the share
 *                 affordance's single mobile home; heart moved to actions row)
 */
// MEH-2465 follow-up: what is being shared names the button for a screen
// reader. The page decides; "business" stays the default so every existing
// call site keeps «שתפו לינק לעסק».
const ARIA_LABEL_KEY = {
  business: "modal_title",
  event: "modal_title_event",
  experience: "modal_title_experience", // MEH-2549
  recipe: "modal_title_recipe", // MEH-2558
};

export default function ShareButton({
  url,
  title,
  description,
  city,
  category,
  variant = "default",
  subject = "business",
}) {
  const t = useTranslations("share");
  const ariaLabel = t(ARIA_LABEL_KEY[subject] ?? ARIA_LABEL_KEY.business);
  // Variants that SHOW text name the button with that text first (WCAG 2.5.3
  // Label in Name — axe 4.14 `label-content-name-mismatch`); the icon-only
  // overlay keeps the plain subject label.
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
        className="bg-surface/95 hover:bg-surface rounded-full w-11 h-11 flex items-center justify-center shadow-md hover:scale-105 transition focus-visible:ring-2 focus-visible:ring-primary/40"
        title={t("copy_link")}
        aria-label={ariaLabel}
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
        className="inline-flex items-center gap-1.5 min-h-touch py-2 text-[13px] font-medium text-text hover:text-primary rounded transition focus-visible:ring-2 focus-visible:ring-primary/40"
        title={t("copy_link")}
        aria-label={labelInName(t("quiet_label"), ariaLabel)}
      >
        <ShareNetwork size={17} className="text-primary-dark" aria-hidden="true" />
        {t("quiet_label")}
      </button>
    );
  }

  if (variant === "outline") {
    // MEH-2548: one of a pair of equal buttons beside «הוספה ליומן» on the
    // event / experience page (Luma, Eventbrite). Same label as "quiet".
    return (
      <Button
        type="button"
        onClick={handleShare}
        data-testid="share-outline"
        variant="outlined" size="sm" className="flex-1"
        title={t("copy_link")}
        aria-label={labelInName(t("quiet_label"), ariaLabel)}
      >
        <ShareNetwork size={18} aria-hidden="true" />
        {t("quiet_label")}
      </Button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center justify-center gap-2 bg-surface border border-border px-3 py-2 min-h-touch min-w-touch rounded-sm hover:bg-green-50 transition text-sm focus-visible:ring-2 focus-visible:ring-primary/40"
      title={t("copy_link")}
      aria-label={labelInName(t("trigger"), ariaLabel)}
    >
      <ShareNetwork size={16} aria-hidden="true" />
      <span className="hidden sm:inline">{t("trigger")}</span>
    </button>
  );
}
