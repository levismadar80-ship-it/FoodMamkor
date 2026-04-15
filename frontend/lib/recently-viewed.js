/**
 * Recently-viewed producers — localStorage helpers (MEH-11).
 *
 * Storage shape:
 *   [{ id: string|number, viewedAt: number }, …]   // cap 5, newest first
 *
 * Backward-compat: previous implementation stored bare [id1, id2, …]
 * with no timestamps. We can't honor a 7-day TTL on those entries
 * (we don't know when they were viewed), so legacy storage is treated
 * as expired and silently cleared the next time the page reads.
 */

export const STORAGE_KEY = "recently_viewed";
export const MAX_ENTRIES = 5;
export const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Whether a localStorage handle is available.
 * Guards SSR + private-mode quirks where window/localStorage throws on access.
 */
function hasStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * Read the raw stored array. Returns [] on missing/invalid/legacy shape.
 * Pure read — does NOT prune; pruning happens in getRecentlyViewedIds().
 */
function readRaw() {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Detect legacy bare-id format ([id, id, …] instead of [{id, viewedAt}, …]):
    // every element must be an object with id+viewedAt to be considered current.
    if (
      parsed.length > 0 &&
      parsed.some((e) => e == null || typeof e !== "object" || !("id" in e))
    ) {
      // Legacy shape — drop everything (treat as expired) and clear.
      window.localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Get the IDs of recently viewed producers, newest first, capped at
 * MAX_ENTRIES, with anything older than TTL_MS filtered out.
 */
export function getRecentlyViewedIds(now = Date.now()) {
  const fresh = readRaw().filter(
    (e) => typeof e.viewedAt === "number" && now - e.viewedAt < TTL_MS,
  );
  return fresh.slice(0, MAX_ENTRIES).map((e) => e.id);
}

/**
 * Push a producer onto the recently-viewed list. Dedups by id (the
 * existing entry is removed before unshifting the new stamped entry),
 * caps the list at MAX_ENTRIES, and writes synchronously.
 *
 * Safe to call from a useEffect on producer detail mount.
 */
export function pushRecentlyViewed(producerId, now = Date.now()) {
  if (producerId == null || !hasStorage()) return;
  try {
    const existing = readRaw().filter((e) => e.id !== producerId);
    const next = [{ id: producerId, viewedAt: now }, ...existing].slice(
      0,
      MAX_ENTRIES,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private-mode failures — fail silently, this is a nice-to-have.
  }
}
