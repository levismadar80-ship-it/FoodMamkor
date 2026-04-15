"use client";

import { useEffect, useState } from "react";
import { HeartStraight } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

/**
 * FavoriteButton — auth-gated save button for a producer.
 *
 * Variants:
 *   - "default" (sidebar pair with ShareButton)    — emoji heart in a 44×44 tap target
 *   - "gallery" (absolute overlay on ImageGallery) — white circle 44px, HeartStraight icon
 *   - "inline"  (next to <h1> in producer header)  — small heart + "שמור" text
 *
 * All variants share: auth gate, load-once of /users/me/favorites,
 * POST/DELETE toggle, toast, disabled:opacity-60 while loading,
 * aria-pressed + aria-label for accessibility.
 */
export default function FavoriteButton({ producerId, variant = "default" }) {
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

  const label = favorited ? "הסר ממועדפים" : "הוסף למועדפים";
  const commonProps = {
    onClick: toggle,
    disabled: loading,
    title: label,
    "aria-label": label,
    "aria-pressed": favorited,
  };

  if (variant === "gallery") {
    return (
      <button
        {...commonProps}
        className="bg-white/95 hover:bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-md hover:scale-105 transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <HeartStraight
          size={22}
          weight={favorited ? "fill" : "regular"}
          className={favorited ? "text-red-500" : "text-site-text"}
          aria-hidden="true"
        />
      </button>
    );
  }

  if (variant === "inline") {
    return (
      <button
        {...commonProps}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium min-h-[32px] border transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
          favorited
            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            : "bg-white text-site-text border-border hover:bg-light"
        }`}
      >
        <HeartStraight
          size={14}
          weight={favorited ? "fill" : "regular"}
          aria-hidden="true"
        />
        שמור
      </button>
    );
  }

  // default — back-compat for existing sidebar usage
  return (
    <button
      {...commonProps}
      className="text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center hover:scale-110 transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 rounded p-1"
    >
      {favorited ? "❤️" : "🤍"}
    </button>
  );
}
