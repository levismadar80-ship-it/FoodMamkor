// @ts-check
// MEH-3465: one business's saved state, now and on every change. FavoriteButton,
// ProducerUpdatesButton, ProducerHeader and ProducerCard each carried this
// hydrate-then-subscribe block. Its own module (not inside favorites-cache) so
// a test that mocks "@/lib/favorites-cache" still drives it through the mock.
import { ensureFavoritesLoaded, isFavorited, subscribeFavorites } from "@/lib/favorites-cache";

/**
 * @param {string} producerId
 * @param {(saved: boolean) => void} onChange
 * @returns {() => void} cleanup for a useEffect; no change is delivered after it
 */
export function watchFavorited(producerId, onChange) {
  let alive = true;
  ensureFavoritesLoaded().then(() => {
    if (alive) onChange(isFavorited(producerId));
  });
  const unsub = subscribeFavorites(() => {
    if (alive) onChange(isFavorited(producerId));
  });
  return () => {
    alive = false;
    unsub();
  };
}
