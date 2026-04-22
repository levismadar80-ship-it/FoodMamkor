"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Leaf, Star } from "@phosphor-icons/react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";

// "ספיר ל." — first name + last initial (privacy)
function formatName(fullName) {
  if (!fullName) return "לקוחה";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function StarRow({ value, size = 16 }) {
  return (
    <div className="flex gap-0.5" dir="ltr" aria-label={`${value} כוכבים`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          weight={n <= value ? "fill" : "regular"}
          color={n <= value ? "#8B6914" : "#e8e0d0"}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }) {
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
            aria-label={`${n} כוכבים`}
          >
            <Star
              size={32}
              weight={filled ? "fill" : "regular"}
              color={filled ? "#8B6914" : "#e8e0d0"}
            />
          </button>
        );
      })}
    </div>
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
export default function ReviewsSection({ producerId, avgRating = 0, reviewCount = 0 }) {
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

  useEffect(() => {
    try {
      if (localStorage.getItem(`wa_clicked_${producerId}`) === "1") {
        setHasClickedWa(true);
      }
    } catch {}
  }, [producerId]);

  const fetchPage = (p) => {
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
      .finally(() => setLoading(false));
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
      setError("בחרי דירוג בין 1 ל-5 כוכבים");
      return;
    }
    if (body.length < 10) {
      setError("הביקורת צריכה לכלול לפחות 10 תווים");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post(`/producers/${producerId}/reviews`, { stars, body });
      setReviews((prev) => [r.data, ...prev.filter((x) => x.user_id !== r.data.user_id)]);
      setTotal((t) => t + (reviews.some((x) => x.user_id === r.data.user_id) ? 0 : 1));
      setShowForm(false);
      showToast("הביקורת שלך נשמרה ⭐");
    } catch (err) {
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    } finally {
      setSubmitting(false);
    }
  };

  const showSummary = total >= 3 && avgRating > 0;

  return (
    <section ref={sectionRef} className="mt-12 pt-8 border-t border-border">
      <h2 className="font-headline text-2xl font-bold text-site-text mb-6">
        מה אומרות הלקוחות
        {total > 0 && (
          <span className="text-base font-normal text-site-muted ms-2">({total})</span>
        )}
      </h2>

      {/* Rating summary block — only when ≥3 reviews */}
      {showSummary && (
        <div className="bg-light rounded-lg p-6 text-center mb-6">
          <p
            className="font-headline font-black leading-none text-site-text mb-2"
            style={{ fontSize: 48 }}
          >
            {Number(avgRating).toFixed(1)}
          </p>
          <StarRow value={Math.round(Number(avgRating))} size={20} />
          <p className="text-site-muted text-sm mt-2">מבוסס על {total} ביקורות</p>
        </div>
      )}

      {/* Write review CTA / form */}
      {user ? (
        hasClickedWa ? (
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="mb-6 border border-site-text text-site-text px-5 py-2 rounded-[6px] text-sm font-medium hover:bg-light transition"
            >
              כתבי ביקורת
            </button>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-[16px] p-5 border border-border mb-8 space-y-4"
            >
              <h3 className="font-headline text-lg font-bold text-site-text">כתבי ביקורת</h3>
              <div>
                <label className="block text-sm text-site-text mb-2">דירוג</label>
                <StarPicker value={stars} onChange={setStars} />
              </div>
              <div>
                <label htmlFor="review-body" className="block text-sm text-site-text mb-1">
                  החוויה שלך
                </label>
                <textarea
                  id="review-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full border border-border rounded-[8px] px-3 py-2 bg-white resize-none focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                  placeholder="איך הייתה החוויה שלך?"
                />
                <p className="text-xs text-site-muted mt-1">{body.length}/500</p>
              </div>
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary-dark text-white px-6 py-2 rounded-[8px] hover:opacity-90 transition disabled:opacity-60 text-sm font-medium"
                >
                  {submitting ? "שומרת..." : "פרסמי ביקורת"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm text-site-muted hover:text-site-text transition"
                >
                  ביטול
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="bg-light/50 rounded-[16px] p-5 border border-border mb-6 text-sm text-site-muted text-center">
            לחצי על כפתור WhatsApp כדי ליצור קשר — ואז תוכלי לכתוב ביקורת
          </div>
        )
      ) : (
        <div className="bg-light/50 rounded-[16px] p-5 border border-border mb-6 text-sm text-site-muted text-center">
          <a href="/login" className="text-primary hover:underline">
            התחברי
          </a>{" "}
          כדי לכתוב ביקורת
        </div>
      )}

      {/* Reviews list */}
      {loading ? (
        <p className="text-sm text-site-muted">טוענת ביקורות...</p>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8">
          <Leaf size={48} weight="duotone" className="text-primary/70 mx-auto mb-2" aria-hidden="true" />
          <p className="text-site-muted">עדיין אין ביקורות — היי הראשונה!</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {reviews.map((review) => (
              <div key={review.id} className="bg-background py-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-body font-semibold text-[15px] text-site-text leading-snug">
                      {formatName(review.user_name)}
                    </p>
                    {review.created_at && (
                      <p className="text-[13px] text-site-muted mt-0.5">
                        {new Date(review.created_at).toLocaleDateString("he-IL")}
                      </p>
                    )}
                  </div>
                  <StarRow value={review.stars} size={16} />
                </div>
                {review.body && (
                  <p className="text-[15px] text-site-text/85 leading-relaxed whitespace-pre-line">
                    {review.body}
                  </p>
                )}
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page <= 1}
                aria-label="עמוד קודם"
                className="p-2 rounded-full hover:bg-light transition disabled:opacity-30"
              >
                <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </button>
              <span className="text-sm text-site-muted" dir="ltr">
                {page} / {pages}
              </span>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={page >= pages}
                aria-label="עמוד הבא"
                className="p-2 rounded-full hover:bg-light transition disabled:opacity-30"
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
