"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { submitReview } from "@/lib/rescue";
import Button from "@/components/ui/Button";

/**
 * Module:   RescueReview
 * Purpose:  One star row and a few contents chips, after a bag was collected.
 * Does NOT: feed the business's public rating — `rescue_reviews` is pilot
 *           feedback read by the chunk-5 metrics, not `producer_reviews`.
 * Related:  backend POST /rescue/orders/{id}/review (buyer, after handed, once)
 * History:  MEH-2648 (creation)
 */
const STARS = [1, 2, 3, 4, 5];
const CONTENT_TAGS = ["bread", "pastry", "vegetables", "dairy", "cooked", "other"];

export default function RescueReview({ orderId, onDone }) {
  const t = useTranslations("rescue");
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function toggle(tag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  async function submit() {
    if (!rating) return;
    setBusy(true);
    setFailed(false);
    try {
      await submitReview(orderId, { rating, contents_tags: tags });
      onDone?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="rescue-review" className="border border-border rounded-md px-4 py-4">
      <p className="font-headline-md text-base font-black text-text">{t("review.title")}</p>

      <div className="flex gap-1 mt-2" role="radiogroup" aria-label={t("review.title")}>
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t("review.star", { n })}
            onClick={() => setRating(n)}
            data-testid={`rescue-review-star-${n}`}
            className={`w-11 h-11 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              n <= rating ? "text-gold-deep" : "text-fg-muted"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <p className="font-body-sm text-sm text-fg-muted mt-3">{t("review.contents")}</p>
      <div className="flex flex-wrap gap-2 mt-1">
        {CONTENT_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={tags.includes(tag)}
            onClick={() => toggle(tag)}
            data-testid={`rescue-review-tag-${tag}`}
            className={`px-3 py-1 rounded-full border font-body-sm text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              tags.includes(tag) ? "border-primary text-primary" : "border-border text-fg-muted"
            }`}
          >
            {t(`review.tag.${tag}`)}
          </button>
        ))}
      </div>

      {/* Above the submit, per the canvas brief: someone with a complaint
          should find the door before they rate and leave. */}
      <p className="font-body-sm text-sm text-fg-muted mt-4" data-testid="rescue-review-problem">
        {t("review.problem")}
      </p>

      {failed && (
        <p className="font-body-sm text-sm text-error mt-2" data-testid="rescue-review-error">
          {t("review.failed")}
        </p>
      )}

      <Button
        type="button"
        onClick={submit}
        disabled={!rating || busy}
        data-testid="rescue-review-submit"
        variant="primary" size="lg" className="w-full mt-3"
      >
        {t("review.submit")}
      </Button>
    </div>
  );
}
