/**
 * Module:   pending-action
 * Purpose:  One-shot "finish what the guest started" intent across the login
 *           round-trip (MEH-1334 revision-2 #7): a guest tap on שמירה/מעקב
 *           stores the intended action + scroll position; after sign-in the
 *           button that owns the action consumes the intent, completes the
 *           original action automatically, and restores the scroll position —
 *           no dead-end at the login screen.
 * Does NOT: perform the action itself (FavoriteButton / FollowButton own
 *           their API calls) or persist beyond the tab (sessionStorage).
 * Related:  components/FavoriteButton.jsx, components/FollowButton.jsx,
 *           components/LoginPromptModal.jsx (the login hand-off).
 * History:  MEH-1334 chunk 1 (creation).
 */

const KEY = "pending_action";

/** Store a guest's intended action before the login hand-off. */
export function setPendingAction(type, producerId) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ type, producerId, scrollY: window.scrollY }),
    );
  } catch {
    // storage unavailable (private mode) — login still works, just no auto-complete
  }
}

/** Drop a stored intent (guest dismissed the login prompt). */
export function clearPendingAction() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Consume the stored intent if it matches this action + producer.
 * Removes the key on match (one-shot — a StrictMode double-effect or a second
 * mount finds nothing), so callers can act on the return value directly.
 * @returns {{ scrollY: number } | null}
 */
export function consumePendingAction(type, producerId) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw);
    if (intent?.type !== type || intent?.producerId !== producerId) return null;
    sessionStorage.removeItem(KEY);
    return { scrollY: Number(intent.scrollY) || 0 };
  } catch {
    return null;
  }
}
