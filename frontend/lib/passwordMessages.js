/**
 * Hebrew failure-string lookup for the MEH-306 password policy.
 *
 * Keys mirror the backend's `PolicyFailure` literals from
 * backend/app/services/password_policy.py:32:
 *   "too_short" | "too_common" | "same_as_current"
 *
 * The `fallback` entry covers any future failure key the backend adds
 * before this lookup is updated — forward-compat against silent UX
 * regression.
 *
 * Tone: feminine (per CLAUDE.md voice rules) and specific (per MEH-306
 * forbidden-list — no generic "סיסמה לא חוקית").
 */

import { PASSWORD_MIN_LENGTH } from "./validators";

export const PASSWORD_FAILURE_MESSAGES = {
  too_short: `סיסמתך חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`,
  too_common: "הסיסמה הזו דלפה ברשת — בחרי סיסמה אחרת",
  same_as_current: "הסיסמה החדשה זהה לקודמת — בחרי סיסמה שונה",
  fallback: "הסיסמה לא עומדת בדרישות, נסי משהו ארוך וייחודי יותר",
};

/**
 * Map a failure key to its Hebrew message. Unknown keys → fallback.
 */
export function failureMessage(key) {
  return PASSWORD_FAILURE_MESSAGES[key] ?? PASSWORD_FAILURE_MESSAGES.fallback;
}

/**
 * Map a backend 422 detail.failures array to the FIRST renderable
 * Hebrew message. Used by /reset-password and /settings catch blocks
 * to surface the most-relevant failure when multiple fire.
 */
export function firstFailureMessage(failures) {
  if (!Array.isArray(failures) || failures.length === 0) {
    return PASSWORD_FAILURE_MESSAGES.fallback;
  }
  return failureMessage(failures[0]);
}
