"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import StarSelector from "@/components/StarSelector";
import api from "@/lib/api";

export default function RatingPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/home-products/rate/${token}`)
      .then((r) => {
        setInfo(r.data);
        if (r.data.already_rated) setSubmitted(true);
      })
      .catch(() => setError("קישור לא תקין"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (stars === 0) return;
    try {
      await api.post(`/home-products/rate/${token}`, { stars, comment: comment || null });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בשליחה");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary">טוענת...</p>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-[12px] p-8 text-center max-w-sm">
          <p className="text-xl">😕</p>
          <p className="text-text-secondary mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-[12px] p-8 text-center max-w-sm">
          <p className="text-5xl mb-4">🙏</p>
          <h1 className="text-2xl font-bold mb-2">תודה!</h1>
          <p className="text-text-secondary">הדירוג שלך נשמר. זה עוזר לקהילה.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-[12px] p-8 max-w-sm w-full">
        <h1 className="text-xl font-bold text-center mb-2">איך היה?</h1>
        {info?.seller_name && (
          <p className="text-center text-text-secondary mb-1">
            קנית מ<strong>{info.seller_name}</strong>
          </p>
        )}
        {info?.product_title && (
          <p className="text-center text-text-secondary mb-6">{info.product_title}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <StarSelector value={stars} onChange={setStars} />

          <div>
            <input
              type="text"
              placeholder="תגובה קצרה (אופציונלי)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={100}
              className="w-full border rounded-[12px] px-3 py-2 text-center"
            />
            <p className="text-xs text-text-secondary text-center mt-1">{comment.length}/100</p>
          </div>

          {error && <p className="text-red-500 text-sm text-center" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={stars === 0}
            className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
          >
            שלח דירוג
          </button>
        </form>
      </div>
    </div>
  );
}
