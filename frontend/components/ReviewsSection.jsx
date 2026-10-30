"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, EyeSlash, Star } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";
import { captureReviewInvite } from "@/lib/review-invite";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { formatEventDate } from "@/lib/format-date";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/Skeleton";

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

// MEH-1233 B1: fractional fill — an average of 4.7 renders four full stars and
// one 70%-filled star instead of Math.round-ing to five full (which reads as a
// faked 5.0). Each position paints an empty base star with a filled star clipped
// to `fill*100%` on top; the row is dir="ltr" so the clip grows from the star's
// left edge (logical start inside the LTR container). Integer values (a single
// review's `stars`) still render as solid full stars — same visual as before.
function StarRow({ value, size = 16, ariaLabel }) {
  const numeric = Number(value) || 0;
  return (
    // MEH-1556: role="img" makes the aria-label legal here. Without a role,
    // aria-label on a plain div is prohibited ARIA (axe aria-prohibited-attr,
    // serious) and assistive tech drops the label silently — leaving the row
    // unlabelled, since every star span below is aria-hidden. role="img" also
    // matches the intent: the five stars are one indivisible graphic reading
    // "4.8 כוכבים". Both call sites (:383, :528) always pass the i18n
    // star_aria label, so the name can never be empty (role-img-alt is safe).
    <div className="flex gap-0.5" dir="ltr" role="img" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, numeric - (n - 1)));
        return (
          <span
            key={n}
            className="relative inline-block"
            style={{ width: size, height: size }}
            aria-hidden="true"
          >
            <Star size={size} weight="regular" color="#e5dfd3" />
            {fill > 0 && (
              <span
                className="absolute inset-y-0 start-0 overflow-hidden"
                style={{ width: `${Math.round(fill * 100)}%` }}
              >
                <Star size={size} weight="fill" color="#896714" />
              </span>
            )}
          </span>
        );
      })}
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
        // MEH-2592: a side rule marks the business's voice — the green box
        // read as a second review card.
        <div className="mt-3 border-s-2 border-primary/40 ps-3" data-testid="review-reply">
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
      {/* MEH-1103: 44px hit area + text-[13px] → text-sm (the DESIGN.md 14px
          floor applies to all interactive text, secondary included). */}
      {isOwner && (
        <button
          type="button"
          onClick={() => { setDraft(reply || ""); setEditing(true); }}
          className="mt-2 min-h-[44px] inline-flex items-center text-sm text-primary hover:underline"
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
 * MEH-1428 chunk 2: OR hold the owner's "request a review" token (`?rt=`,
 * kept per producer by lib/review-invite.js) — forwarded as `review_token`
 * and verified server-side (reviews.py `_invited_by_token`).
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
  // Reviews render 3-at-a-time; "הצג עוד" reveals +3 and appends the next
  // server page when the local buffer runs out (replaces the old carousel).
  const [visibleCount, setVisibleCount] = useState(3);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hasClickedWa, setHasClickedWa] = useState(false);
  // MEH-1428 chunk 2: the invite token for THIS producer, if any.
  const [inviteToken, setInviteToken] = useState(null);
  // Guest login prompt target. Set after mount (window is client-only) so the
  // server markup and the first client render agree; until then it is plain
  // /login, which is what it always was.
  const [loginHref, setLoginHref] = useState("/login");
  const sectionRef = useRef(null);
  // MEH-1426: fire the anonymous-click→login re-ping at most once per mount.
  const rePingedRef = useRef(false);

  // MEH-1426: open the review form and repair the anonymous-click→login edge
  // case. A WhatsApp click made while logged out set wa_clicked_<id> locally but
  // wrote a user_id=NULL row in the DB, so the backend gate (reviews.py guard 3)
  // would 403 despite the local flag. On form open, re-fire ONE authenticated
  // ping (pingWhatsAppBeacon is auth-aware) so an attributed row exists by submit
  // time — the form's stars + ≥10-char body give the keepalive POST ample time to
  // commit. Gated to a logged-in user who has the local flag; once per mount
  // (an extra click row is acceptable, server-side).
  const openReviewForm = () => {
    if (user && hasClickedWa && !rePingedRef.current) {
      pingWhatsAppBeacon(producerId);
      rePingedRef.current = true;
    }
    setShowForm(true);
  };
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
    setInviteToken(captureReviewInvite(producerId, window.location.search));
    // MEH-1428 chunk 2: come back to THIS page's reviews after login — a
    // customer who opened the owner's link must land on the form, not on /.
    // Same redirect shape as LoginPromptModal.jsx:103 (clamped by
    // lib/safe-redirect.js on the login side).
    const back = `${window.location.pathname}${window.location.search}#reviews`;
    setLoginHref(`/login?redirect=${encodeURIComponent(back)}`);
  }, [producerId]);

  const fetchPage = (p) => {
    if (inFlightRef.current) return; // HOT-018: drop overlapping requests
    inFlightRef.current = true;
    setLoading(true);
    api
      .get(`/producers/${producerId}/reviews`, { params: { page: p } })
      .then((r) => {
        const fresh = Array.isArray(r.data?.reviews) ? r.data.reviews : [];
        // Append (was replace) so "הצג עוד" accumulates pages. id-dedupe guards
        // a double page-1 fetch (StrictMode / IO re-observe) from producing
        // duplicate React keys; an error keeps what's already loaded.
        setReviews((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...fresh.filter((x) => !seen.has(x.id))];
        });
        setTotal(r.data?.total ?? 0);
        setPages(r.data?.pages ?? 1);
        setPage(p);
      })
      .catch(() => {})
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
      // MEH-1428 chunk 2: the key is sent only when a token exists, so the
      // WhatsApp-click path posts exactly the body it always did.
      const payload = inviteToken ? { stars, body, review_token: inviteToken } : { stars, body };
      const r = await api.post(`/producers/${producerId}/reviews`, payload);
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

  // Reveal +3; when the local buffer is exhausted and more server pages remain,
  // append the next page. The button is disabled while loading (below) so this
  // can't race the HOT-018 in-flight lock.
  const handleShowMore = () => {
    const next = visibleCount + 3;
    setVisibleCount(next);
    if (next > reviews.length && page < pages) {
      fetchPage(page + 1);
    }
  };

  const showSummary = total > 0 && avgRating > 0;
  const anonymousFallback = t("anonymous_fallback");

  return (
    <section ref={sectionRef} className="mt-12">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-6">
        {t("section_heading")}
        {total > 0 && (
          <span className="text-base font-normal text-fg-muted ms-2">({total})</span>
        )}
      </h2>

      {/* Rating summary block — only when ≥3 reviews */}
      {/* MEH-2592: the summary is one line — number · stars · count, aligned to
          the start (Airbnb / Google). The 150px centred box left the stars
          pushed to one side: StarRow is a dir="ltr" flex row, so in a centred
          block it hugged the left edge while the number sat in the middle. */}
      {showSummary && (
        <div className="flex items-center gap-2.5 mb-6" data-testid="reviews-summary">
          <p
            className="font-headline-md text-2xl font-bold leading-none text-text"
            dir="ltr"
          >
            {Number(avgRating).toFixed(1)}
          </p>
          <StarRow
            value={Number(avgRating)}
            size={18}
            ariaLabel={t("star_aria", { value: Number(avgRating).toFixed(1) })}
          />
          <p className="text-fg-muted text-sm">{t("summary_count", { count: total })}</p>
        </div>
      )}

      {/* Write review CTA / form */}
      {user ? (
        // Producer owners cannot review their own business (backend guard mirrors this)
        user.producer_id === producerId ? null :
        hasClickedWa || inviteToken ? (
          !showForm ? (
            <button
              onClick={openReviewForm}
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
        ) : null
      ) : null}

      {/* Reviews list */}
      {loading ? (
        <SkeletonList count={2} label={t("loading")} />
      ) : reviews.length === 0 ? (
        isOwner ? (
          <>
            {/* MEH-1114: owner-only marker — this empty state renders only for
                the producer owner (isOwner), never for readers. The eyebrow chip
                makes that explicit so the owner doesn't mistake this internal
                coaching copy for something customers see. */}
            <div className="mb-4 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-alt px-3 py-1 text-xs font-label-md text-fg-muted">
                <EyeSlash size={14} weight="regular" aria-hidden="true" />
                {t("owner_only_eyebrow")}
              </span>
            </div>
            <EmptyState
              icon={Star}
              title={t("owner_empty_title")}
              description={t("owner_empty_description")}
              ctaLabel={t("owner_empty_cta")}
              ctaHref="/producer/dashboard/followers"
            />
          </>
        ) : (
          // MEH-2592 (Sapir, 30/10): a reader sees NO empty state. The old
          // 48px Leaf + «עדיין אין ביקורות כאן.» announced the absence, and
          // before launch that was nearly every page. Google keeps only the
          // write-a-review affordance at zero reviews, Airbnb a one-liner; here
          // the section collapses to its heading and the write hint below
          // (login line / WhatsApp-gate line), which already says what a
          // reader can do. The owner's coaching state above is unchanged.
          null
        )
      ) : (
        <>
          <div className="divide-y divide-border">
            {reviews.slice(0, visibleCount).map((review) => (
              <div key={review.id} className="bg-background py-6">
                {/* MEH-2592: initial circle · name + date, stars under the name —
                    the stars used to sit at the far edge of the screen, away
                    from the person who gave them. */}
                <div className="flex items-start gap-3 mb-3">
                  <span
                    aria-hidden="true"
                    data-testid="review-initial"
                    className="w-10 h-10 shrink-0 rounded-full bg-green-50 text-primary flex items-center justify-center font-bold"
                  >
                    {Array.from(formatName(review.user_name, anonymousFallback))[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="font-body-md font-semibold text-[15px] text-text leading-snug">
                      {formatName(review.user_name, anonymousFallback)}
                      {formatEventDate(review.created_at, locale, REVIEW_DATE_OPTIONS) && (
                        <span
                          className="ms-2 text-[13px] font-normal text-fg-muted"
                          dir="ltr"
                          data-testid="review-date"
                        >
                          {formatEventDate(review.created_at, locale, REVIEW_DATE_OPTIONS)}
                        </span>
                      )}
                    </p>
                    <div className="mt-1 flex">
                      <StarRow
                        value={review.stars}
                        size={14}
                        ariaLabel={t("star_aria", { value: review.stars })}
                      />
                    </div>
                  </div>
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

          {visibleCount < total && (
            // Centered CTA — justify-center is the direction-neutral horizontal-
            // center idiom (no physical props). Replaces the MEH-877 carousel.
            // "הצג עוד" only — no "show less" (MEH-1387 anti-pattern).
            // MEH-2592: a full-width button, like Airbnb's «הצגת כל הביקורות».
            <div className="mt-4">
              <button
                type="button"
                onClick={handleShowMore}
                disabled={loading}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface-card text-sm font-semibold text-text hover:bg-green-50 transition disabled:opacity-50"
              >
                {t("show_more")}
                <CaretDown size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}

      {/* MEH-2592: who may write a review, as one quiet line UNDER the reviews
          rather than a box above them. Same gates as before: the login line
          for a visitor; the WhatsApp-gate line (MEH-1139) for a logged-in,
          non-owner, not-yet-gated reader — at zero reviews too, since the
          reader empty state is gone (it used to carry its own hint). */}
      {!user ? (
        <p className="mt-4 text-sm text-fg-muted" data-testid="reviews-write-hint">
          {t.rich("login_prompt", {
            login: (chunks) => (
              <Link href={loginHref} data-testid="reviews-login-link" className="text-primary underline">{chunks}</Link>
            ),
          })}
        </p>
      ) : user.producer_id !== producerId && !hasClickedWa && !inviteToken ? (
        <p className="mt-4 text-sm text-fg-muted" data-testid="reviews-write-hint">
          {t("wa_gate_message")}
        </p>
      ) : null}
    </section>
  );
}
