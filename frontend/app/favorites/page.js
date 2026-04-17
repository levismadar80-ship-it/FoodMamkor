"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { useFirstVisit } from "@/lib/useFirstVisit";

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFirstVisit = useFirstVisit("favorites_tour");

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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Breadcrumb
        items={[{ href: "/", label: "בית" }, { label: "מועדפים" }]}
        className="mb-4"
      />
      <h1 className="font-headline text-3xl font-bold mb-8 text-site-text inline-flex items-center gap-2">
        <Heart size={28} weight="fill" className="text-red-500" aria-hidden="true" />
        המועדפים שלי
      </h1>

      {loading ? (
        <SkeletonProducerGrid count={6} />
      ) : favorites.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-light mb-6 text-5xl">
            🌿
          </div>
          <h2 className="font-headline text-2xl font-bold text-site-text mb-2">
            עדיין לא שמרת עסקים 🌿
          </h2>
          <p className="text-site-muted mb-6 max-w-md mx-auto">
            לחצי על הלב בכרטיסיית עסק כדי לשמור אותו כאן לגישה מהירה.
          </p>
          {isFirstVisit && (
            <div className="inline-flex items-center gap-2 bg-light border border-primary/20 rounded-[12px] px-4 py-3 mb-6 text-sm text-primary">
              <span className="text-xl" aria-hidden="true">👇</span>
              <span>לחצי על ❤️ בכרטיס עסק כדי לשמור אותו כאן</span>
            </div>
          )}
          <div>
            <button
              onClick={() => router.push("/")}
              className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium"
            >
              גלי עסקים
            </button>
          </div>
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
