"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import EmptyState from "@/components/ui/EmptyState";

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      api
        .get("/users/me/favorites")
        .then((r) => setFavorites(r.data))
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">❤️ המועדפים שלי</h1>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-[12px] overflow-hidden animate-pulse">
              <div className="h-56 bg-border" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-border rounded w-3/4" />
                <div className="h-4 bg-border rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          emoji="⚠️"
          title="שגיאה בטעינת המועדפים"
          description="לא הצלחנו לטעון את הרשימה. אפשר לנסות שוב."
          ctaLabel="נסי שוב"
          ctaOnClick={() => { setError(false); setLoading(true); api.get("/users/me/favorites").then((r) => setFavorites(r.data)).catch(() => setError(true)).finally(() => setLoading(false)); }}
        />
      ) : favorites.length === 0 ? (
        <EmptyState
          emoji="🤍"
          title="עדיין לא שמרת עסקים 🌿"
          description="לחצי על ❤️ בכרטיס עסק כדי לשמור אותו כאן"
          ctaLabel="גלי בתי עסק"
          ctaHref="/"
        />
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
