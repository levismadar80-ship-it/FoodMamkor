"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      api
        .get("/users/me/favorites")
        .then((r) => setFavorites(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">❤️ המועדפים שלי</h1>

      {loading ? (
        <p className="text-center text-text-secondary">טוען...</p>
      ) : favorites.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🤍</p>
          <p className="text-text-secondary mb-4">עדיין לא שמרת עסקים למועדפים</p>
          <button
            onClick={() => router.push("/")}
            className="bg-primary text-white px-6 py-2 rounded-[12px] hover:bg-primary-light transition"
          >
            גלה יצרנים
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((fav) => (
            <ProducerCard key={fav.producer_id} producer={fav.producer} />
          ))}
        </div>
      )}
    </div>
  );
}
