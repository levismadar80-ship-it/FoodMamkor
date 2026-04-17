"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

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
      } else {
        await api.post(`/users/me/favorites/${producerId}`);
      }
      setFavorited(!favorited);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="text-2xl p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:scale-110 transition"
      title={favorited ? "הסר ממועדפים" : "הוסף למועדפים"}
    >
      {favorited ? "❤️" : "🤍"}
    </button>
  );
}
