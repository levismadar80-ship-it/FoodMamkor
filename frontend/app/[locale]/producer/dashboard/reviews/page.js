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
 * Does NOT: hide a review (admin only; MEH-3260 lets the owner REPORT one
 *           through the card's ⋮), or show hidden reviews —
 *           the list is what customers see on the public page.
 * Related:  components/ReviewsSection.jsx (ReviewReply, StarRow, the name
 *           format) · dashboard/tools/page.js (the «ביקורות» tile).
 * History:  MEH-3107 (creation). MEH-3536 (reads move onto lib/use-api.js).
 */

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Star } from "@phosphor-icons/react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { useUserApi } from "@/lib/use-api";
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
import ReviewReportMenu from "@/components/ReviewReportMenu";

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
        <ReviewInitial seedKey={review.id} letter={avatarInitial(name, "")} />
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
        {/* MEH-3260: the owner can report a review too. */}
        <div className="ms-auto -mt-2 -me-2 shrink-0">
          <ReviewReportMenu review={review} producerId={review.producer_id} authorName={name} />
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
  const isOwner = Boolean(user) && user?.role === "producer";

  // MEH-3536: both reads go through the shared data layer. `/producers/me` is
  // the same cached answer every dashboard screen on the layer reads; the
  // reviews wait for it (a dependent read: no request until the id exists).
  const me = useUserApi("/producers/me", { enabled: isOwner });
  const producerId = me.data?.id;
  const list = useUserApi("/reviews", {
    enabled: isOwner && producerId !== undefined && producerId !== null,
    params: { producer_id: producerId },
    view: "owner-unanswered-first",
    // Sorted once, when the list arrives — not on every render — so a reply
    // saved below does not move its row (see handleSaved).
    transform: (data) => unansweredFirst(Array.isArray(data) ? data : []),
  });

  // `/producers/me` answered without an id: the reviews can never be asked
  // for, so it is a failure, not an endless skeleton.
  const noId = Boolean(me.data) && (producerId === undefined || producerId === null);
  const failed = (noId || Boolean(me.error || list.error)) && !me.isValidating && !list.isValidating;
  // A retry after a failure shows the skeleton, as the old reload did — not
  // whatever list was cached before the failure.
  const retrying = Boolean(me.error || list.error) && (me.isValidating || list.isValidating);
  const reviews = failed || retrying ? null : /** @type {any[] | undefined} */ (list.data) ?? null;

  // Retry: ask again for whichever read failed. While it runs the skeleton
  // shows, as the old reload did.
  const load = () => {
    if (me.error || noId) me.mutate();
    else list.mutate();
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
    }
    // `router` is left out on purpose: a new object per render would push on
    // every render (same choice as recipes/page.js).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // A saved reply replaces the row in place — re-sorting would move the
  // review the owner just answered out from under her.
  const handleSaved = (/** @type {any} */ updated) =>
    list.mutate((rows) => (rows || []).map((r) => (r.id === updated.id ? updated : r)), { revalidate: false });

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
