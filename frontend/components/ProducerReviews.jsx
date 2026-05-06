"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Leaf } from "@phosphor-icons/react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import StarSelector from "./StarSelector";

/**
 * Reviews section for a producer.
 *
 * Gate: a logged-in user can only write a review after clicking the producer's
 * WhatsApp CTA. The localStorage key `wa_clicked_${producerId}` is set by
 * ProducerDetail.jsx on button click. The backend enforces the same rule via
 * producer_whatsapp_clicks.user_id.
 *
 * - GET /producers/{id}/reviews?page=N — paginated 10
 * - POST /producers/{id}/reviews — upsert (backend enforces unique per user)
 * - DELETE /reviews/:id — owner/admin
 */
export default function ProducerReviews({ producerId }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // true once the user has clicked WhatsApp for this producer
  const [hasClickedWa, setHasClickedWa] = useState(false);
  const sectionRef = useRef(null);

  // Read localStorage flag on mount
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

  // IO lazy-fetch: only call the reviews API when this section is visible.
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

  // Pre-fill form if the current user has already reviewed
  useEffect(() => {
    if (!user) return;
    const mine = reviews.find((r) => r.user_id === user.id);
    if (mine) {
      setStars(mine.stars);
      setBody(mine.body || "");
      // If they already have a review they passed the gate already
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
    setSubmitting(true);
    try {
      const r = await api.post(`/producers/${producerId}/reviews`, {
        stars,
        body: body || null,
      });
      setReviews((prev) => {
        const without = prev.filter((x) => x.user_id !== r.data.user_id);
        return [r.data, ...without];
      });
      setTotal((t) => t + (reviews.some((x) => x.user_id === r.data.user_id) ? 0 : 1));
      showToast("הביקורת שלך נשמרה ⭐");
    } catch (err) {
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    } finally {
      setSubmitting(false);
    }
  };

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;

  return (
    <section ref={sectionRef} className="mt-12 pt-8 border-t border-border">
      <h2 className="font-headline text-2xl font-bold text-site-text mb-6">
        ביקורות לקוחות
        {total > 0 && <span className="text-base font-normal text-site-muted ms-2">({total})</span>}
      </h2>

      {/* Write form */}
      {user ? (
        hasClickedWa ? (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-[16px] p-5 border border-border mb-8 space-y-4"
          >
            <h3 className="font-headline text-lg font-bold text-site-text">
              {myReview ? "עדכני את הביקורת שלך" : "כתבי ביקורת"}
            </h3>
            <div>
              <label className="block text-sm text-site-text mb-2">דירוג</label>
              <StarSelector value={stars} onChange={setStars} />
            </div>
            <div>
              <label htmlFor="review-body" className="block text-sm text-site-text mb-1">
                ספרי על החוויה שלך
              </label>
              <textarea
                id="review-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full border border-border rounded-[8px] px-3 py-2 bg-white resize-none focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                placeholder="מה אהבת? איך הייתה המסירה? האם תמליצי?"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-white px-6 py-2 rounded-[8px] hover:bg-primary-light transition disabled:opacity-60"
            >
              {submitting ? "שומרת..." : myReview ? "עדכני ביקורת" : "פרסמי ביקורת"}
            </button>
          </form>
        ) : (
          <div className="bg-light/50 rounded-[16px] p-5 border border-border mb-8 text-sm text-site-muted text-center">
            לחצי על כפתור WhatsApp כדי ליצור קשר — ואז תוכלי לכתוב ביקורת
          </div>
        )
      ) : (
        <div className="bg-light/50 rounded-[16px] p-5 border border-border mb-8 text-sm text-site-muted text-center">
          <a href="/login" className="text-primary hover:underline">התחברי</a> כדי לכתוב ביקורת
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-site-muted">טוענת ביקורות...</p>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8">
          <div className="mb-2 flex justify-center">
            <Leaf size={48} weight="duotone" className="text-primary/70" aria-hidden="true" />
          </div>
          <p className="text-site-muted">עדיין אין ביקורות — היי הראשונה!</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="bg-white rounded-[16px] p-4 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-0.5" dir="ltr" aria-label={`${review.stars} כוכבים`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className="text-lg">
                        {n <= review.stars ? "⭐" : "☆"}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-site-muted flex items-center gap-1">
                    <span>{review.user_name || "אנונימית"}</span>
                    {review.created_at && (
                      <span dir="ltr">
                        · {new Date(review.created_at).toLocaleDateString("he-IL")}
                      </span>
                    )}
                  </span>
                </div>
                {review.body && (
                  <p className="text-site-text/85 text-sm leading-relaxed whitespace-pre-line">
                    {review.body}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
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
