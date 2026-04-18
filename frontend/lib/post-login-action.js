/**
 * Post-login action queue. Stores one pending action in sessionStorage
 * so a guest tap on "save" can be replayed after authentication.
 *
 * Format: a single string key `post_login_action` holding
 *   "{verb}:{payload}" — currently only "favorite:{producer_id}".
 *
 * Kept in sessionStorage (not localStorage) so a closed tab clears the
 * intent — stale replay is worse than a missed one. The consumer is
 * AuthContext; the producer is ProducerCard's heart button.
 */

const KEY = "post_login_action";

export function enqueueFavoriteOnLogin(producerId) {
  if (typeof window === "undefined" || !producerId) return;
  try {
    window.sessionStorage.setItem(KEY, `favorite:${producerId}`);
  } catch {
    // Private mode / quota — accept silent loss rather than crash.
  }
}

export function readPendingAction() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const [verb, payload] = raw.split(":", 2);
    if (!verb || !payload) return null;
    return { verb, payload };
  } catch {
    return null;
  }
}

export function clearPendingAction() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
