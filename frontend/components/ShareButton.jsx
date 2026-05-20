"use client";

import { useTranslations } from "next-intl";
import { showToast } from "@/lib/toast";
import { ShareNetwork } from "@phosphor-icons/react";
import { BRAND_NAME } from "@/lib/constants";

export default function ShareButton({ url, title, description, city, category }) {
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

  const handleShare = async () => {
    if (!url) return;
    // Try native share first (mobile) — text only, no file fetching
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: title || BRAND_NAME, text: shareText, url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast(t("copied_toast"));
    } catch {
      // last-resort fallback
      const ta = document.createElement("textarea");
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast(t("copied_toast"));
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 bg-white border border-border px-3 py-2 min-h-[44px] rounded-[8px] hover:bg-light transition text-sm focus-visible:ring-2 focus-visible:ring-primary/40"
      title={t("copy_link")}
      aria-label={t("modal_title")}
    >
      <ShareNetwork size={16} weight="duotone" aria-hidden="true" />
      <span className="hidden sm:inline">{t("trigger")}</span>
    </button>
  );
}
