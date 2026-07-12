"use client";

import { useTranslations } from "next-intl";
import {
  WhatsappLogo,
  LinkSimple,
  ShareNetwork,
  EnvelopeSimple,
  Check,
} from "@phosphor-icons/react";
import { showToast } from "@/lib/toast";
import { SITE_URL } from "@/lib/env";
import { BRAND_NAME } from "@/lib/constants";

/**
 * ShareClient — the /share ("ספרו עלינו") page body (MEH-1160).
 *
 * Module:   ShareClient
 * Purpose:  Invites readers to spread the word about the project itself —
 *           site-level extension of the per-business viral loop. Four share
 *           actions: WhatsApp, copy link, native share, email.
 * Does NOT: contain any donation/payment element (MEH-1159 — reader income
 *           is a separate post-launch track) or per-business share logic
 *           (that lives in ShareButton.jsx / WhatsAppShareButton.jsx).
 * Related:  frontend/components/ShareButton.jsx:23-50 (native+clipboard+toast
 *           pattern) · frontend/components/WhatsAppShareButton.jsx:23 (wa.me
 *           prefill) · frontend/app/[locale]/share/page.js (metadata wrapper)
 * History:  MEH-1160 (creation)
 */

// Shared card-style for all four actions — v4 idiom (surface card, sharp
// corners, border-accent hover), ≥44px touch target.
const ACTION_CLASSES =
  "flex w-full items-center gap-3 bg-surface-card border border-border rounded-none px-4 py-3 min-h-[56px] text-base font-medium text-text hover:border-primary transition focus-visible:ring-2 focus-visible:ring-primary/40";

export default function ShareClient() {
  const t = useTranslations("share_page");

  // Site-level message — {url} = site root (spec: no page-specific URLs here).
  const message = t("message", { url: SITE_URL });

  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(t("email_subject"))}&body=${encodeURIComponent(message)}`;

  // REUSES: frontend/components/ShareButton.jsx:34-49 — clipboard + toast
  // with execCommand last-resort fallback.
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      showToast.success(t("copy_toast"), { icon: <Check size={18} /> });
    } catch {
      const ta = document.createElement("textarea");
      ta.value = SITE_URL;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast.success(t("copy_toast"), { icon: <Check size={18} /> });
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  // REUSES: frontend/components/ShareButton.jsx:23-33 — native share first,
  // graceful fallback to copy (user cancel or unsupported).
  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: BRAND_NAME, text: message, url: SITE_URL });
        return;
      } catch {
        // cancelled or unsupported — fall through to copy
      }
    }
    await copyLink();
  };

  return (
    // The [locale] layout already owns <main id="main-content"> — plain div
    // here avoids a nested main landmark.
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="font-headline-lg font-bold text-primary-dark text-[clamp(28px,5vw,40px)] mb-4">
        {t("h1")}
      </h1>
      <p className="text-base leading-relaxed text-text mb-8">{t("intro")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={ACTION_CLASSES}
          data-testid="share-whatsapp"
        >
          <WhatsappLogo size={22} aria-hidden="true" className="shrink-0 text-primary" />
          {t("whatsapp")}
        </a>

        <button type="button" onClick={copyLink} className={ACTION_CLASSES} data-testid="share-copy">
          <LinkSimple size={22} aria-hidden="true" className="shrink-0 text-primary" />
          {t("copy")}
        </button>

        <button type="button" onClick={nativeShare} className={ACTION_CLASSES} data-testid="share-native">
          <ShareNetwork size={22} aria-hidden="true" className="shrink-0 text-primary" />
          {t("native")}
        </button>

        <a href={mailHref} className={ACTION_CLASSES} data-testid="share-email">
          <EnvelopeSimple size={22} aria-hidden="true" className="shrink-0 text-primary" />
          {t("email")}
        </a>
      </div>
    </div>
  );
}
