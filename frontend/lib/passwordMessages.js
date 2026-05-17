/**
 * Failure-key → translation lookup for the MEH-306 password policy.
 *
 * Pure, locale-agnostic helpers. Callers pass a translator function `t`
 * scoped to the `auth.passwordValidation` namespace (e.g. from
 * `useTranslations("auth.passwordValidation")`); strings live in
 * `frontend/messages/{he,en}.json` so /en users see English copy on
 * 422 validation failures.
 *
 * Keys mirror the backend's `PolicyFailure` literals from
 * backend/app/services/password_policy.py:32:
 *   "too_short" | "too_common" | "same_as_current"
 *
 * Unknown / future keys fall back to the `fallback` message — forward-
 * compat against silent UX regression if the backend ships a new code
 * before this lookup is updated.
 *
 * MEH-628: lib was previously hardcoded Hebrew. Migrated to `t()`
 * injection so the lib stays pure and locale-agnostic.
 */

import { PASSWORD_MIN_LENGTH } from "./validators";

const KNOWN_KEYS = ["too_short", "too_common", "same_as_current"];

function requireTranslator(t) {
  if (typeof t !== "function") {
    throw new Error(
      "passwordMessages: caller must pass a translator function `t` scoped to auth.passwordValidation",
    );
  }
}

/**
 * Map a failure key to its translated message. Unknown keys → fallback.
 * `too_short` is rendered with the PASSWORD_MIN_LENGTH ICU param so
 * callers don't need to know the policy minimum.
 */
export function failureMessage(key, t) {
  requireTranslator(t);
  if (key === "too_short") {
    return t("too_short", { min: PASSWORD_MIN_LENGTH });
  }
  if (KNOWN_KEYS.includes(key)) {
    return t(key);
  }
  return t("fallback");
}

/**
 * Map a backend 422 detail.failures array to the FIRST renderable
 * message. Used by /reset-password, /register, and /settings catch
 * blocks to surface the most-relevant failure when multiple fire.
 */
export function firstFailureMessage(failures, t) {
  requireTranslator(t);
  if (!Array.isArray(failures) || failures.length === 0) {
    return t("fallback");
  }
  return failureMessage(failures[0], t);
}
