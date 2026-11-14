"use client";

import { useTranslations } from "next-intl";
import { ShareNetwork, Check } from "@phosphor-icons/react";
import {
  OVERLAY_ICON_BUTTON,
  OVERLAY_ICON_FACE,
  OVERLAY_ICON_SIZE,
} from "@/lib/overlay-icon-button";
import { BRAND_NAME } from "@/lib/constants";
import { labelInName } from "@/lib/label-in-name";
import Button from "@/components/ui/Button";
import { shareOrCopyText } from "@/lib/share-link";
import { showToast } from "@/lib/toast";

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
  organizer: "modal_title_organizer", // MEH-3018
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
  const tPage = useTranslations("share_page");
  const ariaLabel = t(ARIA_LABEL_KEY[subject] ?? ARIA_LABEL_KEY.business);
  // Variants that SHOW text name the button with that text first (WCAG 2.5.3
  // Label in Name — axe 4.14 `label-content-name-mismatch`); the icon-only
  // overlay keeps the plain subject label.
  const resolvedTitle = title || t("wa_message_business_fallback");
  const metaSep = t("wa_meta_separator");
  // MEH-2996: the link travels ONLY as `url` — inside `text` too, iOS can
  // share plain text instead of a link card (MEH-2827 PR 6).
  const shareText = [
    t("wa_message_with_meta", { title: resolvedTitle }),
    description ? `${description.slice(0, 80)}...` : "",
    city || category
      ? `${city || ""}${city && category ? metaSep : ""}${category || ""}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // MEH-2996: the site's one share sequence (lib/share-link.js) — the
  // phone's share sheet; no sheet (most desktops) → copy the link and say so.
  // Replaces the MEH-1290 wa.me fallback: sharing is the generic sheet, never
  // a WhatsApp-only link (Sapir 08/11, ShareSiteActions.jsx; 12/11 decision).
  const handleShare = async () => {
    if (!url) return;
    const outcome = await shareOrCopyText({
      data: { title: title || BRAND_NAME, text: shareText, url },
      copyText: url,
    });
    if (outcome === "copied") showToast.success(t("copied_toast"), { icon: <Check size={18} /> });
    else if (outcome === "failed") showToast.error(tPage("copy_failed_toast"));
  };

  if (variant === "overlay") {
    return (
      <button
        onClick={handleShare}
        // MEH-3115: the shared photo-button anatomy (44px hit, 32px face).
        className={OVERLAY_ICON_BUTTON}
        // MEH-2964: a locator, as the `outline` variant below already has. The
        // preview-gating test needs to count this button, and every other
        // attribute it carries is a translated string — matching on one would
        // have passed for the wrong reason under a key-echo mock.
        data-testid="share-overlay"
        title={t("copy_link")}
        aria-label={ariaLabel}
      >
        <span className={OVERLAY_ICON_FACE}>
          <ShareNetwork size={OVERLAY_ICON_SIZE} className="text-text" aria-hidden="true" />
        </span>
      </button>
    );
  }

  if (variant === "quiet") {
    // MEH-1334: header quiet-actions row — borderless icon + locked label
    // "שיתוף"; ≥44px hit-area via min-h + transparent padding (revision-2 #5).
    return (
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 min-h-touch py-2 text-sm font-medium text-text hover:text-primary rounded transition focus-visible:ring-2 focus-visible:ring-primary"
        title={t("copy_link")}
        aria-label={labelInName(t("quiet_label"), ariaLabel)}
      >
        <ShareNetwork size={18} className="text-primary-dark" aria-hidden="true" />
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
      className="inline-flex items-center justify-center gap-2 bg-surface border border-border px-3 py-2 min-h-touch min-w-touch rounded-sm hover:bg-green-50 transition text-sm focus-visible:ring-2 focus-visible:ring-primary"
      title={t("copy_link")}
      aria-label={labelInName(t("trigger"), ariaLabel)}
    >
      <ShareNetwork size={16} aria-hidden="true" />
      <span className="hidden sm:inline">{t("trigger")}</span>
    </button>
  );
}
