"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Heart } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import AlertPrefsPanel from "@/components/AlertPrefsPanel";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { useFirstVisit } from "@/lib/useFirstVisit";

function FavoriteCardWrapper({ fav }) {
  const t = useTranslations("favorites");
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <ProducerCard producer={fav.producer} />
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("alerts_aria")}
        aria-label={t("alerts_aria")}
        className="absolute top-2 end-2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow text-primary hover:scale-105 transition z-10"
      >
        <Bell size={16} weight={open ? "fill" : "regular"} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2">
          <AlertPrefsPanel
            producerId={fav.producer_id}
            producerName={fav.producer?.name || ""}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  const t = useTranslations("favorites");
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
        items={[{ href: "/", label: t("breadcrumb_home") }, { label: t("breadcrumb_favorites") }]}
        className="mb-4"
      />
      <h1 className="font-headline text-3xl font-bold mb-8 text-site-text inline-flex items-center gap-2">
        <Heart size={28} weight="fill" className="text-red-500" aria-hidden="true" />
        {t("title")}
      </h1>

      {loading ? (
        <SkeletonProducerGrid count={6} />
      ) : favorites.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-light mb-6 text-5xl">
            🌿
          </div>
          <h2 className="font-headline text-2xl font-bold text-site-text mb-2">
            {t("empty_title")}
          </h2>
          <p className="text-site-muted mb-6 max-w-md mx-auto">
            {t("empty_subtitle")}
          </p>
          {isFirstVisit && (
            <div className="inline-flex items-center gap-2 bg-light border border-primary/20 rounded-[12px] px-4 py-3 mb-6 text-sm text-primary">
              <span className="text-xl" aria-hidden="true">👇</span>
              <span>{t("first_visit_tip")}</span>
            </div>
          )}
          <div>
            <button
              onClick={() => router.push("/")}
              className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium"
            >
              {t("empty_cta")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-site-muted mb-4 flex items-center gap-1.5" dir="rtl">
            <Bell size={13} aria-hidden="true" />
            {t("list_alerts_hint")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((fav) => (
              <FavoriteCardWrapper key={fav.producer_id} fav={fav} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
