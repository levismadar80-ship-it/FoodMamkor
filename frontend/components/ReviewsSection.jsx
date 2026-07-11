"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Leaf, Star } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { formatEventDate } from "@/lib/format-date";
import EmptyState from "@/components/ui/EmptyState";

// HOT-018 (MEH-782): numeric short date (e.g. 7.6.2026) — preserves the prior
// `toLocaleDateString` default while routing through the Invalid-Date-guarded,
// locale-aware helper so /en no longer renders Hebrew review dates.
const REVIEW_DATE_OPTIONS = { year: "numeric", month: "numeric", day: "numeric" };

// "Sapir L." — first name + last initial (privacy)
function formatName(fullName, fallback) {
  if (!fullName) return fallback;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function StarRow({ value, size = 16, ariaLabel }) {
  return (
    <div className="flex gap-0.5" dir="ltr" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          weight={n <= value ? "fill" : "regular"}
          color={n <= value ? "#896714" : "#e5dfd3"}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function StarPicker({ value, onChange, ariaLabelFn }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-2" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            className="transition hover:scale-110"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            aria-label={ariaLabelFn(n)}
          >
            <Star
              size={32}
              weight={filled ? "fill" : "regular"}
              color={filled ? "#896714" : "#e5dfd3"}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * MEH-1039: business-owner reply to a single customer review.
 *
 * Display + owner edit. Renders the reply block only when review.reply is
 * present (empty reply → nothing). The producer owner (isOwner) additionally
 * gets an add/edit affordance that PUTs to /reviews/{id}/reply.
 *
 * NOTE (CHUNK B pending): the PUT endpoint + the reply/reply_at fields in the
 * GET payload land in reviews.py, which is blocked on MEH-1001. Until that
 * merges, review.reply is undefined (so nothing renders for viewers) and the
 * owner's save call 404s — this UI is display-ready and degrades gracefully.
 * Length rules (2-1000 chars, ≥3 letters, MEH-555) are enforced server-side;
 * the client only gates the trivial <2-char case on the Save button.
 */
function ReviewReply({ review, isOwner, onSaved }) {
  const t = useTranslations("reviews");
  const tError = useTranslations("error");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.reply || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reply = review.reply;

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const r = await api.put(`/reviews/${review.id}/reply`, { reply: draft.trim() });
      onSaved(r.data);
      setEditing(false);
    } catch (err) {
      setError(detailToMessage(err.response?.data?.detail) || tError("generic"));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-3">
        <label htmlFor={`reply-${review.id}`} className="block text-[13px] font-semibold text-primary-dark mb-1">
          {t("reply_heading")}
        </label>
        <textarea
          id={`reply-${review.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={t("reply_placeholder")}
          className="w-full border border-border rounded-[8px] px-3 py-2 bg-white resize-none focus-visible:ring-2 focus-visible:ring-primary/40 outline-none text-[14px]"
        />
        {error && (
          <p className="text-sm text-error mt-1" role="alert">{error}</p>
        )}
        <div className="flex items-center gap-4 mt-2">
          {/* MEH-1103: action buttons carry min-h-[44px] (WCAG 2.5.5). */}
          <button
            type="button"
            onClick={save}
            disabled={saving || draft.trim().length < 2}
            className="min-h-[44px] bg-primary-dark text-white px-5 py-1.5 rounded-[8px] hover:opacity-90 transition disabled:opacity-60 text-sm font-medium"
          >
            {saving ? t("submit_saving") : t("reply_save")}
          </button>
          <button
            type="button"
            onClick={() => { setDraft(reply || ""); setEditing(false); setError(""); }}
            className="min-h-[44px] inline-flex items-center text-sm text-fg-muted hover:text-text transition"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {reply && (
        <div className="mt-3 bg-green-50 rounded-[8px] p-3">
          <p className="text-[13px] font-semibold text-primary-dark">{t("reply_heading")}</p>
          <p className="text-[14px] text-text/85 leading-relaxed whitespace-pre-line mt-0.5">
            {reply}
          </p>
          {review.reply_at && formatEventDate(review.reply_at, locale, REVIEW_DATE_OPTIONS) && (
            <p className="text-[12px] text-fg-muted mt-1" dir="ltr">
              {formatEventDate(review.reply_at, locale, REVIEW_DATE_OPTIONS)}
            </p>
          )}
        </div>
      )}
      {/* MEH-1103: 44px hit area (text stays 13px — secondary owner action). */}
      {isOwner && (
        <button
          type="button"
          onClick={() => { setDraft(reply || ""); setEditing(true); }}
          className="mt-2 min-h-[44px] inline-flex items-center text-[13px] text-primary hover:underline"
        >
          {reply ? t("reply_edit") : t("reply_add")}
        </button>
      )}
    </>
  );
}

/**
 * MEH-103 verified reviews section.
 *
 * Props:
 *   producerId    — UUID string
 *   avgRating     — producer.avg_rating from server (0 if no reviews)
 *   reviewCount   — producer.reviews_count from server
 *
 * Gate: user must have clicked the producer's WhatsApp CTA (localStorage
 * `wa_clicked_{producerId}` === "1"). Backend enforces the same rule via
 * producer_whatsapp_clicks.user_id.
 */
export default function ReviewsSection({ producerId, avgRating = 0, reviewCount = 0, isOwner = false }) {
  const t = useTranslations("reviews");
  // MEH-848: shared generic error copy (collapsed from reviews.error_generic).
  const tError = useTranslations("error");
  const locale = useLocale();
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(reviewCount);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hasClickedWa, setHasClickedWa] = useState(false);
  const sectionRef = useRef(null);
  // HOT-018 (MEH-782): synchronous in-flight lock — blocks a second fetch
  // before React re-renders, so rapid pagination clicks can't fire overlapping
  // requests whose responses resolve out of order (displayed page ≠ state).
  const inFlightRef = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(`wa_clicked_${producerId}`) === "1") {
        setHasClickedWa(true);
      }
    } catch {}
  }, [producerId]);

  const fetchPage = (p) => {
    if (inFlightRef.current) return; // HOT-018: drop overlapping requests
    inFlightRef.current = true;
    setLoading(true);
    api
      .get(`/producers/${producerId}/reviews`, { params: { page: p } })
      .then((r) => {
        setReviews(Array.isArray(r.data?.reviews) ? r.data.reviews : []);
        setTotal(r.data?.total ?? 0);
        setPages(r.data?.pages ?? 1);
        setPage(p);
      })
      .catch(() => setReviews([]))
      .finally(() => {
        inFlightRef.current = false;
        setLoading(false);
      });
  };

  // Lazy-load via IntersectionObserver — only fetch when section is visible.
  useEffect(() => {
    if (!producerId) return;
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          fetchPage(1);
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [producerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill form if user already has a review (passed WA gate before).
  useEffect(() => {
    if (!user) return;
    const mine = reviews.find((r) => r.user_id === user.id);
    if (mine) {
      setStars(mine.stars);
      setBody(mine.body || "");
      setHasClickedWa(true);
    }
  }, [reviews, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (stars < 1 || stars > 5) {
      setError(t("error_invalid_stars"));
      return;
    }
    if (body.length < 10) {
      setError(t("error_body_too_short"));
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post(`/producers/${producerId}/reviews`, { stars, body });
      setReviews((prev) => [r.data, ...prev.filter((x) => x.user_id !== r.data.user_id)]);
      setTotal((tt) => tt + (reviews.some((x) => x.user_id === r.data.user_id) ? 0 : 1));
      setShowForm(false);
      showToast.success(t("saved_toast"), { icon: <Star size={18} weight="fill" /> });
    } catch (err) {
      setError(detailToMessage(err.response?.data?.detail) || tError("generic"));
    } finally {
      setSubmitting(false);
    }
  };

  // MEH-1039: replace a single review in place after its owner reply saves.
  const handleReplySaved = (updated) => {
    setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const showSummary = total >= 3 && avgRating > 0;
  const anonymousFallback = t("anonymous_fallback");

  return (
    <section ref={sectionRef} className="mt-12 pt-8 border-t border-border">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-6">
        {t("section_heading")}
        {total > 0 && (
          <span className="text-base font-normal text-fg-muted ms-2">({total})</span>
        )}
      </h2>

      {/* Rating summary block — only when ≥3 reviews */}
      {showSummary && (
        <div className="bg-green-50 rounded-lg p-6 text-center mb-6">
          <p
            className="font-headline-display font-black leading-none text-text mb-2"
            style={{ fontSize: 48 }}
            dir="ltr"
          >
            {Number(avgRating).toFixed(1)}
          </p>
          <StarRow
            value={Math.round(Number(avgRating))}
            size={20}
            ariaLabel={t("star_aria", { value: Math.round(Number(avgRating)) })}
          />
          <p className="text-fg-muted text-sm mt-2">{t("summary_based_on", { total })}</p>
        </div>
      )}

      {/* Write review CTA / form */}
      {user ? (
        // Producer owners cannot review their own business (backend guard mirrors this)
        user.producer_id === producerId ? null :
        hasClickedWa ? (
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="mb-6 min-h-[44px] border border-text text-text px-5 py-2 rounded-[6px] text-sm font-medium hover:bg-green-50 transition"
            >
              {t("write_cta")}
            </button>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-[16px] p-5 border border-border mb-8 space-y-4"
            >
              <h3 className="font-headline-md text-lg font-bold text-text">{t("form_heading")}</h3>
              <div>
                <label className="block text-sm text-text mb-2">{t("rating_label")}</label>
                <StarPicker
                  value={stars}
                  onChange={setStars}
                  ariaLabelFn={(n) => t("star_aria", { value: n })}
                />
              </div>
              <div>
                <label htmlFor="review-body" className="block text-sm text-text mb-1">
                  {t("body_label")}
                </label>
                <textarea
                  id="review-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full border border-border rounded-[8px] px-3 py-2 bg-white resize-none focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                  placeholder={t("body_placeholder")}
                />
                <p className="text-xs text-fg-muted mt-1">{body.length}/500</p>
              </div>
              {error && (
                <p className="text-sm text-error" role="alert">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] bg-primary-dark text-white px-6 py-2 rounded-[8px] hover:opacity-90 transition disabled:opacity-60 text-sm font-medium"
                >
                  {submitting ? t("submit_saving") : t("submit")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="min-h-[44px] inline-flex items-center text-sm text-fg-muted hover:text-text transition"
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="bg-green-50/50 rounded-[16px] p-5 border border-border mb-6 text-sm text-fg-muted text-center">
            {t("wa_gate_message")}
          </div>
        )
      ) : (
        <div className="bg-green-50/50 rounded-[16px] p-5 border border-border mb-6 text-sm text-fg-muted text-center">
          {t.rich("login_prompt", {
            login: (chunks) => (
              <a href="/login" className="text-primary hover:underline">{chunks}</a>
            ),
          })}
        </div>
      )}

      {/* Reviews list */}
      {loading ? (
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      ) : reviews.length === 0 ? (
        isOwner ? (
          <EmptyState
            icon={Star}
            title={t("owner_empty_title")}
            description={t("owner_empty_description")}
            ctaLabel={t("owner_empty_cta")}
            ctaHref="/producer/dashboard/followers"
          />
        ) : (
          <div className="text-center py-8">
            <Leaf size={48} className="text-primary/70 mx-auto mb-2" aria-hidden="true" />
            <p className="text-fg-muted">{t("empty_message")}</p>
          </div>
        )
      ) : (
        <>
          <div className="divide-y divide-border">
            {reviews.map((review) => (
              <div key={review.id} className="bg-background py-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-body-md font-semibold text-[15px] text-text leading-snug">
                      {formatName(review.user_name, anonymousFallback)}
                    </p>
                    {formatEventDate(review.created_at, locale, REVIEW_DATE_OPTIONS) && (
                      <p className="text-[13px] text-fg-muted mt-0.5" dir="ltr">
                        {formatEventDate(review.created_at, locale, REVIEW_DATE_OPTIONS)}
                      </p>
                    )}
                  </div>
                  <StarRow
                    value={review.stars}
                    size={16}
                    ariaLabel={t("star_aria", { value: review.stars })}
                  />
                </div>
                {review.body && (
                  <p className="text-[15px] text-text/85 leading-relaxed whitespace-pre-line">
                    {review.body}
                  </p>
                )}
                {/* MEH-1039: business reply (display + owner edit). Endpoint
                    lands in CHUNK B (reviews.py, blocked on MEH-1001). */}
                <ReviewReply
                  review={review}
                  isOwner={isOwner}
                  onSaved={handleReplySaved}
                />
              </div>
            ))}
          </div>

          {pages > 1 && (
            // MEH-877: carousel prev/next pair — RTL-correct as-is (prev→right,
            // next→left in Hebrew reading order). Intentionally NOT bidi-flipped:
            // documented rtl.md exception ("Carousel prev/next arrows"). Do not
            // re-flag in future bidi sweeps.
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page <= 1 || loading}
                aria-label={t("pagination.prev_aria")}
                className="p-2 rounded-full hover:bg-green-50 transition disabled:opacity-30"
              >
                <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </button>
              <span className="text-sm text-fg-muted" dir="ltr">
                {page} / {pages}
              </span>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={page >= pages || loading}
                aria-label={t("pagination.next_aria")}
                className="p-2 rounded-full hover:bg-green-50 transition disabled:opacity-30"
              >
                <ArrowLeft size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
