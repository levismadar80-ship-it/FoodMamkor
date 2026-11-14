// @ts-check
"use client";

/**
 * Module:   dashboard/reviews
 * Purpose:  The business reads its reviews and replies to them without
 *           leaving the dashboard — reviews with no reply first (MEH-3107,
 *           MEH-1416's internal reply surface). Shopify, Wolt, Airbnb and
 *           Google all keep this inside the owner's console.
 * Touches:  GET /producers/me (the business id) · GET /reviews?producer_id=
 *           (every visible review, newest first) · PUT /reviews/{id}/reply
 *           (through ReviewReply, the same control as the public page).
 * Does NOT: hide or report a review (admin only), or show hidden reviews —
 *           the list is what customers see on the public page.
 * Related:  components/ReviewsSection.jsx (ReviewReply, StarRow, the name
 *           format) · dashboard/tools/page.js (the «ביקורות» tile).
 * History:  MEH-3107 (creation).
 */

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Star } from "@phosphor-icons/react";
import { useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatEventDate } from "@/lib/format-date";
import BackLink from "@/components/ui/BackLink";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/Skeleton";
import {
  ReviewReply,
  ReviewInitial,
  StarRow,
  formatName,
  REVIEW_DATE_OPTIONS,
} from "@/components/ReviewsSection";
import { avatarInitial } from "@/components/ui/Avatar";

// Both are untyped JSX components whose inferred props mark every prop
// required; the dashboard uses their optional subset.
const Empty = /** @type {any} */ (EmptyState);
const Skeleton = /** @type {any} */ (SkeletonList);

/**
 * Reviews with no reply first; newest first inside each group (the API
 * already returns newest first and Array.prototype.sort is stable).
 * @param {Array<{ reply?: string | null }>} list
 */
function unansweredFirst(list) {
  return [...list].sort((a, b) => Number(Boolean(a.reply)) - Number(Boolean(b.reply)));
}

/** @param {{ review: any, onSaved: (r: any) => void }} props */
function OwnerReviewRow({ review, onSaved }) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const name = formatName(review.user_name, t("anonymous_fallback"));
  const date = formatEventDate(review.created_at, locale, /** @type {any} */ (REVIEW_DATE_OPTIONS));
  return (
    <li
      data-testid="owner-review"
      data-answered={review.reply ? "true" : "false"}
      className={`bg-surface border rounded-lg p-4 ${review.reply ? "border-border" : "border-primary"}`}
    >
      <div className="flex items-start gap-3 mb-2">
        <ReviewInitial seedKey={review.user_id ?? review.user_name} letter={avatarInitial(name, "")} />
        <div className="min-w-0">
          <p className="font-semibold text-text leading-snug">
            {name}
            {date && (
              <span className="ms-2 text-sm font-normal text-fg-muted" dir="ltr">
                {date}
              </span>
            )}
          </p>
          <div className="mt-1 flex">
            <StarRow value={review.stars} size={14} ariaLabel={t("star_aria", { value: review.stars })} />
          </div>
        </div>
      </div>
      {review.body && <p className="text-base text-text/85 leading-relaxed whitespace-pre-line">{review.body}</p>}
      <ReviewReply review={review} isOwner onSaved={onSaved} />
    </li>
  );
}

export default function ProducerDashboardReviewsPage() {
  const t = useTranslations("dashboard.producer");
  const tReviews = useTranslations("reviews");
  const tRecipes = useTranslations("recipes.dashboard");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [reviews, setReviews] = useState(/** @type {any[] | null} */ (null));
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setReviews(null);
    try {
      const me = await api.get("/producers/me");
      const res = await api.get("/reviews", { params: { producer_id: me.data.id } });
      setReviews(unansweredFirst(Array.isArray(res.data) ? res.data : []));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    load();
    // `router` is left out on purpose: a new object per render would reload
    // the list on every render (same choice as recipes/page.js).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, load]);

  // A saved reply replaces the row in place — re-sorting would move the
  // review the owner just answered out from under her.
  const handleSaved = (/** @type {any} */ updated) =>
    setReviews((list) => (list || []).map((r) => (r.id === updated.id ? updated : r)));

  if (authLoading || !user || user.role !== "producer") return null;

  const unanswered = (reviews || []).filter((r) => !r.reply).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <BackLink href="/producer/dashboard/tools" label={tRecipes("back")} />
      <h1 className="font-headline-lg text-3xl font-bold text-text mt-1 mb-2">{t("quick_links.reviews.title")}</h1>

      {failed ? (
        <div data-testid="owner-reviews-error" className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">{t("section_errors.tools")}</p>
          <button type="button" onClick={load} className="text-sm text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current shrink-0">
            {t("section_errors.retry_cta")}
          </button>
        </div>
      ) : reviews === null ? (
        <Skeleton count={3} label={t("loading_data")} className="py-4" />
      ) : reviews.length === 0 ? (
        <Empty
          icon={Star}
          title={tReviews("owner_empty_title")}
          description={tReviews("owner_empty_description")}
        />
      ) : (
        <>
          <p data-testid="owner-reviews-summary" className="text-sm text-fg-muted mb-4 tabular-nums">
            {t("reviews_page.summary", { unanswered, total: reviews.length })}
          </p>
          <ul className="space-y-3">
            {reviews.map((r) => (
              <OwnerReviewRow key={r.id} review={r} onSaved={handleSaved} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
