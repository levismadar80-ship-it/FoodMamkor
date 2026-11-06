"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  ensureFavoritesLoaded,
  getFavoriteProducers,
  subscribeFavorites,
} from "@/lib/favorites-cache";

/**
 * MEH-2724 — the signed-in user's favorited producers for the homepage
 * «המועדפים שלך» strip, newest saved first. Reads the shared favorites cache
 * (one GET /users/me/favorites per session, the same request the hearts
 * already make) and re-reads on every heart change. Signed out → [].
 */
export function useFavoriteProducers() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let alive = true;
    const read = () => {
      if (!alive) return;
      const next = getFavoriteProducers();
      // Skip the re-render when the same cards are in the same order (every
      // heart tap anywhere notifies).
      setItems((prev) =>
        prev.length === next.length && prev.every((p, i) => p.id === next[i].id) ? prev : next,
      );
    };
    ensureFavoritesLoaded().then(read);
    const unsub = subscribeFavorites(read);
    return () => {
      alive = false;
      unsub();
    };
  }, [user]);

  return items;
}
