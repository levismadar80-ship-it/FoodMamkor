// @ts-check
"use client";

/**
 * Module:   AdminReviewReply
 * Purpose:  On /admin/reviews, show the business owner's reply under a
 *           review, its AI flag, and a «הסירי תגובה» action with a confirm.
 * Touches:  PUT /admin/reviews/{id}/clear-reply (reviews.py).
 * Does NOT: hide or delete the review itself — that stays on the page's own
 *           buttons (admin/reviews/page.jsx). Does not notify the business
 *           (known v1 gap, MEH-3259).
 * History:  MEH-3259 (creation).
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

/**
 * @param {{ review: { id: string, reply?: string | null, reply_ai_moderation_status?: string | null, user_name?: string | null, producer_name?: string | null }, onRemoved: (id: string) => void }} props
 */
export default function AdminReviewReply({ review, onRemoved }) {
  const t = useTranslations("admin");
  const tError = useTranslations("error");
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  // The opener unmounts with the reply, so focus goes back to the row's next
  // control (its hide/delete button) instead of falling to <body>.
  const rowRef = useRef(/** @type {HTMLElement | null} */ (null));

  if (!review.reply) return null;

  const remove = async () => {
    setRemoving(true);
    try {
      await api.put(`/admin/reviews/${review.id}/clear-reply`);
      showToast.success(t("reviews.reply_removed_toast"));
      setConfirming(false);
      onRemoved(review.id);
    } catch {
      // Keep the dialog open so the admin can retry or cancel.
      showToast.error(tError("generic"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      ref={(el) => {
        if (el) rowRef.current = el.closest("tr") ?? el.parentElement;
      }}
      data-testid="review-reply"
      className="mt-2 border-s-2 border-border ps-3"
    >
      <div className="flex flex-wrap items-center gap-1 text-xs font-medium text-fg-muted">
        {t("reviews.reply_label")}
        {review.reply_ai_moderation_status === "FLAGGED" && (
          <span
            data-testid="review-reply-ai-flag"
            className="inline-block px-2 py-0.5 rounded-full text-xs bg-accent/10 border border-accent/30 text-gold-deep"
          >
            {t("reviews.ai_flagged")}
          </span>
        )}
      </div>
      <div className="text-muted text-xs whitespace-pre-line">{review.reply}</div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        data-testid="review-remove-reply"
        aria-label={t("reviews.remove_reply_aria", {
          user: review.user_name || t("reviews.default_user"),
        })}
        className="mt-1 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-danger-600 hover:bg-danger-50 focus-visible:ring-2 focus-visible:ring-danger-400/40"
      >
        <Trash size={14} />
        {t("reviews.remove_reply")}
      </button>

      {confirming && (
        <Dialog
          labelledBy={`reply-remove-title-${review.id}`}
          size="sm"
          dismissible={!removing}
          onClose={() => setConfirming(false)}
          fallbackFocus={() => rowRef.current?.querySelector("button") ?? null}
          className="space-y-4"
        >
          <p id={`reply-remove-title-${review.id}`} className="font-medium text-base">
            {t("reviews.confirm_remove_reply", {
              producer: review.producer_name || t("reviews.default_producer"),
            })}
          </p>
          <div className="flex gap-3 justify-start">
            <Button disabled={removing} onClick={remove} variant="danger" size="sm">
              {t("reviews.remove_reply")}
            </Button>
            <Button
              data-autofocus
              disabled={removing}
              onClick={() => setConfirming(false)}
              variant="outlined"
              size="sm"
            >
              {t("common.cancel")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
