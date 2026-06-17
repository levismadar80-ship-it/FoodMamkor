"use client";

/**
 * MEH-251 — Central mapper: axios/fetch error → Hebrew toast message.
 *
 * Before this helper, every component's `.catch` branch either swallowed
 * the error, showed a generic "משהו השתבש", or re-used the server's
 * English detail. That made:
 *   - 429 (rate limit) look like a random server error
 *   - 503 / network failures look like user mistakes
 *   - timeouts indistinguishable from 500s
 *
 * Usage:
 *   import { showToast } from "@/lib/toast";
 *   import { errorMessage } from "@/lib/errors";
 *
 *   try {
 *     await api.post(...);
 *   } catch (err) {
 *     showToast.error(errorMessage(err));
 *   }
 */

import { showToast } from "./toast";

/**
 * Given an axios-shaped error (or any Error), return the best Hebrew
 * sentence to show the user. Falls back to a neutral generic message —
 * never returns undefined / empty string.
 *
 * @param {any} err
 * @returns {string}
 */
export function errorMessage(err) {
  // Offline / network unreachable — axios sets no `response`
  if (!err?.response) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "אין חיבור לאינטרנט. בדקו את הרשת ונסו שוב.";
    }
    if (err?.code === "ECONNABORTED") {
      return "השרת לוקח זמן יותר מהרגיל. נסו שוב בעוד רגע.";
    }
    return "לא הצלחתי להתחבר לשרת. נסו שוב בעוד רגע.";
  }

  const status = err.response.status;
  const detail = err.response.data?.detail;

  // 4xx — the server had something to say
  if (status === 400 || status === 409 || status === 422) {
    // Prefer the server's Hebrew detail when it's a string, else generic
    return typeof detail === "string" && detail ? detail : "הנתונים שנשלחו לא תקינים.";
  }
  if (status === 401) {
    return "הסשן שלך פג. התחברי שוב כדי להמשיך.";
  }
  if (status === 403) {
    return typeof detail === "string" && detail ? detail : "אין הרשאה לפעולה זו.";
  }
  if (status === 404) {
    return typeof detail === "string" && detail ? detail : "הפריט לא נמצא.";
  }
  if (status === 429) {
    return "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.";
  }

  // 5xx — our problem
  if (status >= 500) {
    return "השרת לא זמין כרגע. נסו שוב בעוד רגע.";
  }

  return "משהו השתבש. נסו שוב.";
}

/**
 * Convenience: map the error and show the toast in one call.
 *
 * @param {any} err
 * @param {"error"|"info"} [type="error"]
 */
export function showErrorToast(err, type = "error") {
  // MEH-685: guard the dynamic dispatch — an unexpected `type` (anything
  // other than success/error/info) would be `undefined` post-shim and throw.
  // Fall back to `info` so a bad caller degrades gracefully instead of
  // crashing the catch branch it lives in.
  (showToast[type] ?? showToast.info)(errorMessage(err));
}
