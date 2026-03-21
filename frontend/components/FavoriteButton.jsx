"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

export default function FavoriteButton({ producerId, initialFavorited = false }) {
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [loading, setLoading] = useState(false);

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
      className="text-2xl hover:scale-110 transition"
      title={favorited ? "הסר ממועדפים" : "הוסף למועדפים"}
    >
      {favorited ? "❤️" : "🤍"}
    </button>
  );
}
