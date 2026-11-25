// @ts-check
/**
 * Module:   post-auth-return
 * Purpose:  Remember the page a customer was on when she signed up by email,
 *           so the verification link brings her back to it instead of "/".
 * Touches:  localStorage key "post_auth_return" ({ path, at }), 24 h — the
 *           verify token's own lifetime (backend/app/routers/auth.py, 24 h).
 * Does NOT: decide where a business owner lands (VerifyEmailClient keeps
 *           /producer/dashboard), or carry the guest's pending action
 *           (lib/pending-action.js, sessionStorage, one tab only).
 * Related:  app/[locale]/register/RegisterClient.jsx (writes),
 *           app/[locale]/verify-email/VerifyEmailClient.jsx (reads),
 *           lib/safe-redirect.js isReturnablePath (the only paths kept).
 * History:  MEH-3661 (creation).
 */
import { isReturnablePath } from "@/lib/safe-redirect";

const KEY = "post_auth_return";
export const RETURN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Store the page to come back to. A path that may not be returned to (home,
 * auth screens, token flows, anything external) clears an older one instead.
 * @param {unknown} path
 */
export function rememberReturnPath(path) {
  try {
    if (!isReturnablePath(path)) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // storage unavailable (private mode) — she lands on "/" as before
  }
}

/**
 * The stored page, if it is still fresh and still safe; else null. Read-only:
 * the page renders it more than once, so clearing is a separate step.
 * @returns {string | null}
 */
export function peekReturnPath() {
  try {
    // eslint-disable-next-line no-restricted-syntax -- hand-off state between two steps of one flow (login, claim, pending action); read when the step runs, never painted at load
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw);
    const age = Date.now() - Number(at);
    if (!(age >= 0 && age < RETURN_TTL_MS) || !isReturnablePath(path)) {
      localStorage.removeItem(KEY);
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

/** Forget the stored page (called right before leaving for it). */
export function clearReturnPath() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
