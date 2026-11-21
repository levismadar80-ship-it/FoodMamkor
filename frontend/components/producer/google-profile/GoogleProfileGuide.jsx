// @ts-check
"use client";

/**
 * Module:   GoogleProfileGuide
 * Purpose:  The three steps to open or fix a Google Business Profile, the
 *           business page's link to paste into it, and Google's rule on
 *           review incentives (MEH-3641).
 * Does NOT: call Google — it is copy and two links. The link and check
 *           halves are GoogleProfileLink.jsx and GoogleProfileCheck.jsx.
 * History:  MEH-3641 (creation)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowSquareOut } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { copyText } from "@/lib/clipboard";

const GOOGLE_BUSINESS_URL = "https://business.google.com/";
const STEPS = /** @type {const} */ (["step_1", "step_2", "step_3"]);

/** @param {{ pageUrl: string | null }} props */
export default function GoogleProfileGuide({ pageUrl }) {
  const t = useTranslations("google_profile");
  const [copied, setCopied] = useState(/** @type {boolean | null} */ (null));

  return (
    <section data-testid="google-profile-guide" className="bg-surface border border-border rounded-lg p-5">
      <h2 className="font-headline-md text-lg font-bold text-text mb-3">{t("guide_title")}</h2>
      <ol className="list-decimal ps-5 space-y-2 text-sm text-text">
        {STEPS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <a
          href={GOOGLE_BUSINESS_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="google-profile-open-google"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline"
        >
          {t("open_google")}
          <ArrowSquareOut size={16} aria-hidden="true" />
        </a>
        {pageUrl ? (
          <Button
            variant="secondary"
            size="sm"
            data-testid="google-profile-copy-link"
            onClick={async () => setCopied(await copyText(pageUrl))}
          >
            {t("copy_link")}
          </Button>
        ) : (
          <p className="text-sm text-fg-muted">{t("link_after_approval")}</p>
        )}
      </div>
      {copied === true && (
        <InlineMessage tone="success" size="sm" className="mt-2">{t("copied")}</InlineMessage>
      )}
      {copied === false && pageUrl && (
        <p className="mt-2 text-sm text-fg-muted" dir="ltr">{pageUrl}</p>
      )}
      <p data-testid="google-profile-review-rule" className="mt-4 text-sm text-fg-muted">
        {t("review_rule")}
      </p>
    </section>
  );
}
