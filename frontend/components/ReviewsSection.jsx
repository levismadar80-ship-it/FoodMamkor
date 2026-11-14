"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, EyeSlash, Star } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import {
  CONTACTED_EVENT,
  contactedMethodLocal,
  pingWhatsAppBeacon,
  trackContactClick,
} from "@/lib/contact-tracking";
import ReviewInviteCard, { takeDraftStars } from "@/components/ReviewInviteCard";
import { captureReviewInvite } from "@/lib/review-invite";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { formatEventDate } from "@/lib/format-date";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/Skeleton";
import { seedColorFor } from "@/lib/brand-seeds";
import SectionHeading from "@/components/ui/SectionHeading";
import InlineMessage from "@/components/ui/InlineMessage";
import { avatarInitial } from "@/components/ui/Avatar";

// MEH-2833 (seed layer, board 4): a reviewer's initial sits on a soft tint of
// "their" seed — the seed colour mixed ~24% into the cream page, with an inset
// ring at ~55% — fixed per reviewer (seedColorFor). The letter stays text-ink.
// The page background (`bg-background`, #F5F0E8 in tailwind.tokens.json).
const PAGE_CREAM = [0xf5, 0xf0, 0xe8];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `amount` of the seed colour over cream, as an rgb() string. */
function seedTint(hex, amount) {
  const c = rgb(hex).map((v, i) => Math.round(v * amount + PAGE_CREAM[i] * (1 - amount)));
  return `rgb(${c.join(", ")})`;
}
const INITIAL_TINT = 0.24;
const INITIAL_RING = 0.55;

/** The reviewer's initial on their seed tint; the seed is resolved once. */
function ReviewInitial({ seedKey, letter }) {
  const seed = seedColorFor(seedKey);
  return (
    <span
      aria-hidden="true"
      data-testid="review-initial"
      data-seed={seed.name}
      className="w-10 h-10 shrink-0 rounded-full text-text flex items-center justify-center font-bold"
      style={{
        background: seedTint(seed.fill, INITIAL_TINT),
        boxShadow: `inset 0 0 0 1.5px ${seedTint(seed.fill, INITIAL_RING)}`,
      }}
    >
      {letter}
    </span>
  );
}

// HOT-018 (MEH-782): numeric short date (e.g. 7.6.2026) — preserves the prior
// `toLocaleDateString` default while routing through the Invalid-Date-guarded,
// locale-aware helper so /en no longer renders Hebrew review dates.
const REVIEW_DATE_OPTIONS = { year: "numeric", month: "numeric", day: "numeric" };

// "Sapir L." — first name + last initial (privacy)
// MEH-2705: the initial is the first LETTER of the last word that has one.
// The old `parts[last][0]` took whatever came first, so «לקוחת בדיקות (QA)»
// rendered «לקוחת (.» and «דנה כהן -» rendered «דנה -.».
function formatName(fullName, fallback) {
  if (!fullName) return fallback;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  for (let i = parts.length - 1; i > 0; i--) {
    const letter = parts[i].match(/\p{L}/u);
    if (letter) return `${parts[0]} ${letter[0]}.`;
  }
  return parts[0];
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

// MEH-1337: Google-style distribution — one row per star, 5★ first. Shown
// only from DISTRIBUTION_MIN visible reviews (fewer has nothing to distribute).
// Counts are the server's `rating_counts` over EVERY visible review, never
// the page of 10 on screen. Quiet bars in the star gold, no rating colours
// (MEH-1334). No new copy: each row's name reuses star_aria + summary_count.
const DISTRIBUTION_MIN = 5;

export function shiftRatingCounts(counts, fromStars, toStars) {
  const next = { ...counts };
  const bump = (n, d) => {
    const k = String(n);
    next[k] = Math.max(0, (Number(next[k]) || 0) + d);
  };
  if (fromStars >= 1 && fromStars <= 5) bump(fromStars, -1);
  if (toStars >= 1 && toStars <= 5) bump(toStars, 1);
  return next;
}

function RatingDistribution({ counts, total, t }) {
  return (
    <ul className="flex-1 min-w-0 max-w-xs space-y-1" data-testid="rating-distribution">
      {[5, 4, 3, 2, 1].map((n) => {
        const c = Number(counts[String(n)]) || 0;
        const pct = total > 0 ? Math.round((c / total) * 100) : 0;
        return (
          <li
            key={n}
            data-star={n}
            className="flex items-center gap-2 text-xs text-fg-muted"
            aria-label={`${t("star_aria", { value: n })} · ${t("summary_count", { count: c })}`}
          >
            <span className="w-2 text-center tabular-nums" aria-hidden="true">{n}</span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
              <span
                className="absolute inset-y-0 start-0 rounded-full bg-accent"
                data-testid={`rating-bar-fill-${n}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-5 text-end tabular-nums" aria-hidden="true" data-testid="rating-bar-count">{c}</span>
          </li>
        );
      })}
    </ul>
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
        <label htmlFor={`reply-${review.id}`} className="block text-sm font-semibold text-primary-dark mb-1">
          {t("reply_heading")}
        </label>
        <textarea
          id={`reply-${review.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={t("reply_placeholder")}
          className="w-full border border-border rounded-sm px-3 py-2 bg-surface resize-none focus-visible:ring-2 focus-visible:ring-primary/40 outline-none text-sm"
        />
        {error && (
          <InlineMessage className="mt-1">{error}</InlineMessage>
        )}
        <div className="flex items-center gap-4 mt-2">
          {/* MEH-1103: action buttons carry min-h-touch (WCAG 2.5.5). */}
          <button
            type="button"
            onClick={save}
            disabled={saving || draft.trim().length < 2}
            className="min-h-touch bg-primary-dark text-white px-5 py-1.5 rounded-sm hover:opacity-90 transition disabled:opacity-60 text-sm font-medium"
          >
            {saving ? t("submit_saving") : t("reply_save")}
          </button>
          <button
            type="button"
            onClick={() => { setDraft(reply || ""); setEditing(false); setError(""); }}
            className="min-h-touch inline-flex items-center text-sm text-fg-muted hover:text-text transition"
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
          <p className="text-sm font-semibold text-primary-dark">{t("reply_heading")}</p>
          <p className="text-sm text-text/85 leading-relaxed whitespace-pre-line mt-0.5">
            {reply}
          </p>
          {review.reply_at && formatEventDate(review.reply_at, locale, REVIEW_DATE_OPTIONS) && (
            <p className="text-xs text-fg-muted mt-1" dir="ltr">
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
          className="mt-2 min-h-touch inline-flex items-center text-sm text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current"
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
 * Gate: the user contacted the business from the page, through ANY channel
 * (MEH-2999: localStorage `wa_clicked_{id}` or `contacted_{id}`, read via
 * contactedMethodLocal). Backend enforces the same rule via
 * producer_whatsapp_clicks.user_id OR producer_contact_clicks.user_id
 * (reviews.py, MEH-2204).
 * MEH-1428 chunk 2: OR hold the owner's "request a review" token (`?rt=`,
 * kept per producer by lib/review-invite.js) — forwarded as `review_token`
 * and verified server-side (reviews.py `_invited_by_token`).
 */
export default function ReviewsSection({
  producerId,
  avgRating = 0,
  reviewCount = 0,
  isOwner = false,
  onTotalChange,
  producerName = "",
}) {
  const t = useTranslations("reviews");
  // MEH-848: shared generic error copy (collapsed from reviews.error_generic).
  const tError = useTranslations("error");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(reviewCount);
  const [pages, setPages] = useState(1);
  // MEH-1337: per-star counts from the server; null until it answers.
  const [ratingCounts, setRatingCounts] = useState(null);
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
  // MEH-2705: the header and the sticky bar render producer.reviews_count from
  // the server (ISR, up to 60 s old), so a new review left them one behind.
  // Report the live total upward; the parent decides what to do with it.
  const onTotalChangeRef = useRef(onTotalChange);
  onTotalChangeRef.current = onTotalChange;
  useEffect(() => {
    onTotalChangeRef.current?.(total);
  }, [total]);
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
      // MEH-2999: re-send the click on the channel that was used.
      const method = contactedMethodLocal(producerId);
      if (method === "whatsapp") pingWhatsAppBeacon(producerId);
      else if (method) trackContactClick(producerId, method);
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
      // MEH-2999: any contact channel, not only WhatsApp.
      if (contactedMethodLocal(producerId)) setHasClickedWa(true);
    } catch {}
    setInviteToken(captureReviewInvite(producerId, window.location.search));
    // MEH-1428 chunk 2: come back to THIS page's reviews after login — a
    // customer who opened the owner's link must land on the form, not on /.
    // Same redirect shape as LoginPromptModal.jsx:103 (clamped by
    // lib/safe-redirect.js on the login side).
    const back = `${window.location.pathname}${window.location.search}#reviews`;
    setLoginHref(`/login?redirect=${encodeURIComponent(back)}`);
  }, [producerId]);

  // 13/11/2026: a star tapped on the invite row before the reader could write
  // is kept (ReviewInviteCard) — once they can, open the form with it chosen,
  // as Google does. Fires after sign-in (#reviews return) or a contact tap.
  useEffect(() => {
    if (!user || user.producer_id === producerId || showForm) return;
    if (!hasClickedWa && !inviteToken) return;
    const kept = takeDraftStars(producerId);
    if (!kept) return;
    setStars((s) => s || kept);
    openReviewForm();
  }, [user, hasClickedWa, inviteToken, producerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // MEH-2999: a contact made on this page (a tel: / mailto: tap keeps the
  // page) unlocks the form at once, not after a reload.
  useEffect(() => {
    const onContacted = (e) => {
      if (e.detail?.producerId === producerId && contactedMethodLocal(producerId)) {
        setHasClickedWa(true);
      }
    };
    window.addEventListener(CONTACTED_EVENT, onContacted);
    return () => window.removeEventListener(CONTACTED_EVENT, onContacted);
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
        const rc = r.data?.rating_counts;
        if (rc && typeof rc === "object") setRatingCounts(rc);
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
      const previous = reviews.find((x) => x.user_id === r.data.user_id);
      setReviews((prev) => [r.data, ...prev.filter((x) => x.user_id !== r.data.user_id)]);
      setTotal((tt) => tt + (previous ? 0 : 1));
      // MEH-1337: keep the bars in step with the total — move the owner's own
      // star (edit) or add it (new review), so the five counts still sum to it.
      setRatingCounts((rc) => (rc ? shiftRatingCounts(rc, previous?.stars, r.data.stars) : rc));
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
  const showDistribution = showSummary && total >= DISTRIBUTION_MIN && ratingCounts !== null;
  const anonymousFallback = t("anonymous_fallback");
  // MEH-3053: at zero reviews (no heading, no summary, no list) the invite row
  // is the first thing in the section. Its hairline + mt-8 then framed an
  // empty 80px band under the products list; the section's mt-12 is the gap.
  const inviteFirst = !loading && total === 0 && reviews.length === 0;

  return (
    <section ref={sectionRef} className="mt-12">
      {/* MEH-2634: no heading at zero reviews. MEH-2592 already removed the
          reader empty state, so the heading was announcing an absence on its
          own — «ביקורות» over nothing but the write hint. At zero the section
          is the one quiet line; the count parenthesis was already gated. */}
      {total > 0 && (
        <SectionHeading size="content" className="mb-6">
          {t("section_heading")}
          <span className="text-base font-normal text-fg-muted ms-2">({total})</span>
        </SectionHeading>
      )}

      {/* Rating summary block — only when ≥3 reviews */}
      {/* MEH-2592: the summary is one line — number · stars · count, aligned to
          the start (Airbnb / Google). The 150px centred box left the stars
          pushed to one side: StarRow is a dir="ltr" flex row, so in a centred
          block it hugged the left edge while the number sat in the middle. */}
      {showSummary && (
        <div
          className={showDistribution ? "flex items-center gap-6 mb-6" : "flex items-center gap-2.5 mb-6"}
          data-testid="reviews-summary"
        >
          {/* MEH-1337: with the bars, the number · stars · count stack into one
              column at the start, bars beside it (Google). Without, one line. */}
          <div className={showDistribution ? "flex shrink-0 flex-col items-start gap-1" : "contents"}>
            <p
              className={
                showDistribution
                  ? "font-headline-md text-4xl font-bold leading-none text-text"
                  : "font-headline-md text-2xl font-bold leading-none text-text"
              }
              dir="ltr"
            >
              {Number(avgRating).toFixed(1)}
            </p>
            <StarRow
              value={Number(avgRating)}
              size={showDistribution ? 14 : 18}
              ariaLabel={t("star_aria", { value: Number(avgRating).toFixed(1) })}
            />
            <p className="text-fg-muted text-sm">{t("summary_count", { count: total })}</p>
          </div>
          {showDistribution && <RatingDistribution counts={ratingCounts} total={total} t={t} />}
        </div>
      )}

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
              ctaHref="/producer/dashboard/insights"
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
                  <ReviewInitial
                    seedKey={review.user_id ?? review.user_name}
                    letter={avatarInitial(formatName(review.user_name, anonymousFallback), "")}
                  />
                  <div className="min-w-0">
                    <p className="font-body-md font-semibold text-base text-text leading-snug">
                      {formatName(review.user_name, anonymousFallback)}
                      {formatEventDate(review.created_at, locale, REVIEW_DATE_OPTIONS) && (
                        <span
                          className="ms-2 text-sm font-normal text-fg-muted"
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
                  <p className="text-base text-text/85 leading-relaxed whitespace-pre-line">
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
                className="w-full min-h-touch inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface-card text-sm font-semibold text-text hover:bg-green-50 transition disabled:opacity-50"
              >
                {t("show_more")}
                <CaretDown size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}

      {/* MEH-2999: who may write a review, as a card UNDER the reviews (was a
          quiet grey line, MEH-2592). Same gates: «login» for a visitor; «contact»
          for a logged-in, non-owner reader who has not contacted the business
          and holds no invite link — at zero reviews too. Nothing until
          /auth/me answers, or a signed-in reader sees the guest card for a
          second before it swaps (30/10). */}
      {authLoading ? null : !user ? (
        <ReviewInviteCard
          mode="login"
          first={inviteFirst}
          loginHref={loginHref}
          producerId={producerId}
          producerName={producerName}
        />
      ) : user.producer_id === producerId ? null : !hasClickedWa && !inviteToken ? (
        <ReviewInviteCard mode="contact" first={inviteFirst} producerId={producerId} producerName={producerName} />
      ) : showForm ? (
          // 13/11/2026 (Sapir, option ד): no white box — the form opens IN
          // the Google row, the row's own stars are the rating picker.
          <form
            onSubmit={handleSubmit}
            className={inviteFirst ? "space-y-4" : "mt-8 border-t border-border pt-5 space-y-4"}
            data-testid="reviews-form"
          >
            <h3 className="sr-only">{t("form_heading")}</h3>
            <ReviewInviteCard
              mode="write"
              bare
              value={stars}
              onPick={setStars}
              testId="reviews-form-row"
              producerId={producerId}
              producerName={producerName}
            />
            <div>
              <label htmlFor="review-body" className="block text-sm text-text mb-1">
                {t("body_label")}
              </label>
              <textarea
                id="review-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={500}
                className="w-full border border-border rounded-xl px-3 py-2.5 bg-surface-card resize-none focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                placeholder={t("body_placeholder")}
              />
              <p className="text-xs text-fg-muted mt-1">{body.length}/500</p>
            </div>
            {error && (
              <InlineMessage>
                {error}
              </InlineMessage>
            )}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="min-h-touch bg-primary-dark text-white px-6 py-2 rounded-full hover:opacity-90 transition disabled:opacity-60 text-sm font-medium"
              >
                {submitting ? t("submit_saving") : t("submit")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="min-h-touch inline-flex items-center text-sm text-fg-muted hover:text-text transition"
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : (
        // Allowed to write, form closed: the same row; a star opens the form
        // with that rating (replaces the «כתבו ביקורת» pill above the list).
        <ReviewInviteCard
          mode="write"
          first={inviteFirst}
          value={stars}
          onPick={(n) => {
            setStars(n);
            openReviewForm();
          }}
          testId="reviews-write-row"
          producerId={producerId}
          producerName={producerName}
        />
      )}
    </section>
  );
}
