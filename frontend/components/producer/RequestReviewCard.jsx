"use client";

import { useEffect, useState } from "react";
import { ChatCircleText } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { ReviewInviteLinkSchema } from "@/lib/api-schemas";

/**
 * Module:   RequestReviewCard
 * Purpose:  «בקשו ביקורת מלקוחה» — gives an approved business the signed link
 *           she pastes into her own WhatsApp chat with a customer. Opening it
 *           unlocks the review form without a recorded WhatsApp click.
 * Touches:  GET /producers/me/review-link (read only; re-mints a 30-day token
 *           per call, no DB write — producer_me.py get_review_invite_link).
 * Does NOT: send anything to anyone. There is no outbound message; the owner
 *           copies the link and sends it herself (parent card's design
 *           decision). Does not verify the token — reviews.py does, on submit.
 *           Renders for approved businesses only; the caller gates on
 *           `status === "approved"` because the endpoint 403s otherwise.
 * Related:  components/ReviewsSection.jsx + lib/review-invite.js (the
 *           customer side); app/[locale]/producer/dashboard/followers/page.js
 *           (the copy-link pattern this mirrors, incl. the rejected-clipboard
 *           toast).
 * History:  MEH-1428 chunk 2 (MEH-2330).
 *
 * The link is fetched on mount, not on click: Safari only lets
 * clipboard.writeText run inside the user gesture, and an await between the
 * tap and the write can lose it. The strings are the approved wording, verbatim.
 */
export default function RequestReviewCard() {
  const t = useTranslations("dashboard.producer.request_review");
  const tError = useTranslations("error");
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/producers/me/review-link")
      .then((r) => {
        // Rule 19: a malformed payload is an error, never a clipboard value.
        const parsed = ReviewInviteLinkSchema.safeParse(r.data);
        if (!alive) return;
        if (parsed.success) setUrl(parsed.data.url);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => showToast.error(tError("generic")));
  };

  return (
    <section
      data-testid="request-review-card"
      className="bg-white border border-border rounded-[16px] p-5 mt-6"
    >
      <ChatCircleText size={24} className="text-primary mb-2" aria-hidden="true" />
      <h2 className="font-headline-md text-lg font-bold mb-1">{t("title")}</h2>
      <p className="text-sm text-text mb-2">{t("body")}</p>
      <p className="text-xs text-fg-muted mb-4">{t("hint")}</p>
      {failed ? (
        <p data-testid="request-review-error" className="text-sm text-fg-muted" role="alert">
          {tError("generic")}
        </p>
      ) : (
        <button
          type="button"
          data-testid="request-review-copy"
          onClick={handleCopy}
          disabled={!url}
          className="min-h-[44px] bg-primary text-white rounded-full px-6 py-2 text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50"
        >
          {copied ? t("cta_copied") : t("cta")}
        </button>
      )}
    </section>
  );
}
