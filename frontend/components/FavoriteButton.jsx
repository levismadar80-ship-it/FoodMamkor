"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

export default function FavoriteButton({ producerId }) {
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .get("/users/me/favorites")
      .then((res) => {
        const ids = res.data.map((f) => f.producer_id);
        setFavorited(ids.includes(producerId));
      })
      .catch(() => {});
  }, [user, producerId]);

  if (!user) return null;

  const toggle = async () => {
    setLoading(true);
    try {
      if (favorited) {
        await api.delete(`/users/me/favorites/${producerId}`);
        setFavorited(false);
        showToast("הוסר מהמועדפים");
      } else {
        await api.post(`/users/me/favorites/${producerId}`);
        setFavorited(true);
        showToast("נשמר למועדפים ❤️");
      }
    } catch {
      showToast("משהו השתבש, נסי שוב", "error");
    }
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="text-2xl hover:scale-110 transition focus-visible:ring-2 focus-visible:ring-primary/40 rounded p-1"
      title={favorited ? "הסר ממועדפים" : "הוסף למועדפים"}
      aria-label={favorited ? "הסר ממועדפים" : "הוסף למועדפים"}
      aria-pressed={favorited}
    >
      {favorited ? "❤️" : "🤍"}
    </button>
  );
}
