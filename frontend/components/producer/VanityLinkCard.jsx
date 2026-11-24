// @ts-check
"use client";

/**
 * Module:   VanityLinkCard
 * Purpose:  «הלינק שלי» — the business's short public link with «העתקה» and
 *           «שתפו» (the phone's own share sheet).
 * Does NOT: decide when it shows — the caller gates it (approved, complete,
 *           not an organizer).
 * Related:  app/[locale]/producer/dashboard/share/page.js (its one caller).
 * History:  MEH-53 (creation, on the dashboard home); MEH-2827 PR 8 («שתפו»);
 *           MEH-3064 (failed copy says so); MEH-3767 (moved from the home to
 *           «שיתוף», next to the QR card).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SITE_URL } from "@/lib/env";
import { shareOrCopy } from "@/lib/share-link";
import { copyOrThrow } from "@/lib/clipboard";
import { showToast } from "@/lib/toast";

/** @param {{ slug: string }} props */
export default function VanityLinkCard({ slug }) {
  const t = useTranslations("dashboard.producer.vanity_link");
  const url = `${SITE_URL}/p/${slug}`;
  const [copied, setCopied] = useState(false);

  // MEH-3064: a failed copy says so — this one used to do nothing at all
  // (no catch: an unhandled rejection and a dead button).
  const tFollowers = useTranslations("sweep_tail.followers");
  const copy = () => {
    copyOrThrow(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => showToast.error(tFollowers("share_error")));
  };

  // MEH-2827 PR 8: «שתפו» opens the phone's own share sheet — Instagram
  // stories matter most to food businesses and are reachable only there. The
  // existing message rides as text, the link only as `url`. No sheet (most
  // desktops) → the same copy as the button beside it.
  const tShare = useTranslations("share");
  // MEH-2884: the same helper the insights followers card uses.
  const share = () =>
    shareOrCopy({ url, text: t("wa_text_template", { url: "" }).trim(), copy });

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <p className="text-sm font-medium text-text mb-2">{t("label")}</p>
      <div className="flex items-center gap-2 bg-green-50 rounded-md px-3 py-2 mb-3">
        <span className="text-sm text-primary font-mono flex-1 truncate" dir="ltr">{url}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={copy}
          data-testid="vanity-copy"
          className="flex-1 text-sm border border-border rounded-sm px-3 py-1.5 hover:border-primary transition"
        >
          {copied ? t("copied") : t("copy_cta")}
        </button>
        <button
          type="button"
          onClick={share}
          data-testid="vanity-share"
          className="flex-1 text-sm text-center rounded-full px-3 py-1.5 bg-primary text-background hover:bg-primary-dark transition"
        >
          {tShare("trigger")}
        </button>
      </div>
    </div>
  );
}
