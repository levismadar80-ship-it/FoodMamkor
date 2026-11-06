"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  ensureFavoritesLoaded,
  getFavoriteProducers,
  hadFavoritesLastVisit,
  isFavoritesLoaded,
  subscribeFavorites,
} from "@/lib/favorites-cache";

// Server render has no localStorage; read the hint before the first paint.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * MEH-2724 — the signed-in user's favorited producers for the homepage
 * «המועדפים שלך» strip, newest saved first. Reads the shared favorites cache
 * (one GET /users/me/favorites per session, the same request the hearts
 * already make) and re-reads on every heart change. Signed out → [].
 *
 * MEH-2743 — `reserve`: true while the list is still loading for a browser
 * whose user had favorites last visit, so the strip's height is held and the
 * page below does not jump down when the cards arrive.
 */
export function useFavoriteProducers() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [hint, setHint] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setHint(hadFavoritesLastVisit());
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoaded(false);
      return;
    }
    let alive = true;
    const read = () => {
      if (!alive) return;
      setLoaded(isFavoritesLoaded());
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

  const reserve = hint && items.length === 0 && (loading || (Boolean(user) && !loaded));
  return { items, reserve };
}
