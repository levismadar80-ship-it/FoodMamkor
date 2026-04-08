"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import StarSelector from "./StarSelector";

/**
 * Reviews section for a producer (FIXES_V2.md fix 3).
 *
 * - GET /reviews?producer_id={id} — list
 * - POST /reviews — upsert (backend enforces unique(producer_id, user_id))
 * - DELETE /reviews/:id — owner/admin
 *
 * When the signed-in user has an existing review the form pre-fills
 * with it, so "submit" updates instead of creating a second row.
 */
export default function ProducerReviews({ producerId }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!producerId) return;
    setLoading(true);
    api
      .get("/reviews", { params: { producer_id: producerId } })
      .then((r) => setReviews(r.data))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [producerId]);

  // Pre-fill form if the current user has already reviewed
  useEffect(() => {
    if (!user) return;
    const mine = reviews.find((r) => r.user_id === user.id);
    if (mine) {
      setStars(mine.stars);
      setTitle(mine.title || "");
      setBody(mine.body || "");
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
      const r = await api.post("/reviews", {
        producer_id: producerId,
        stars,
        title: title || null,
        body: body || null,
      });
      // Replace any existing review from this user, prepend new one otherwise
      setReviews((prev) => {
        const without = prev.filter((x) => x.user_id !== r.data.user_id);
        return [r.data, ...without];
      });
      showToast("הביקורת שלך נשמרה ⭐");
    } catch (err) {
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    } finally {
      setSubmitting(false);
    }
  };

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="font-headline text-2xl font-bold text-site-text mb-6">ביקורות לקוחות</h2>

      {/* Write form — signed-in users only */}
      {user ? (
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
            <label htmlFor="review-title" className="block text-sm text-site-text mb-1">
              כותרת קצרה
            </label>
            <input
              id="review-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full border border-border rounded-[8px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
              placeholder="לדוגמה: מוצר מעולה, מוכרת מקסימה"
            />
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
          <a href="/login" className="text-primary hover:underline">התחברי</a> כדי לכתוב ביקורת
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-site-muted">טוענת ביקורות...</p>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-5xl mb-2">🌿</p>
          <p className="text-site-muted">עדיין אין ביקורות — היי הראשונה!</p>
        </div>
      ) : (
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
                <span className="text-xs text-site-muted">
                  {review.user_name || "אנונימית"}
                  {review.created_at && (
                    <> · {new Date(review.created_at).toLocaleDateString("he-IL")}</>
                  )}
                </span>
              </div>
              {review.title && (
                <h4 className="font-headline font-bold text-site-text mb-1">{review.title}</h4>
              )}
              {review.body && (
                <p className="text-site-text/85 text-sm leading-relaxed whitespace-pre-line">
                  {review.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
