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
 * Usage (caller passes an `"error"`-scoped translator — MEH-848):
 *   import { showToast } from "@/lib/toast";
 *   import { errorMessage } from "@/lib/errors";
 *   import { useTranslations } from "next-intl";
 *
 *   const t = useTranslations("error");
 *   try {
 *     await api.post(...);
 *   } catch (err) {
 *     showToast.error(errorMessage(err, t));
 *   }
 */

import { showToast } from "./toast";

/**
 * Given an axios-shaped error (or any Error), return the best localized
 * sentence to show the user. Falls back to the shared generic message —
 * never returns undefined / empty string.
 *
 * MEH-848: copy moved out of this module into `messages/*.json` under the
 * `error.mapper.*` keys (admin-only consumers pass `useTranslations("error")`).
 * A server-supplied `detail` string still wins over the mapped copy.
 *
 * @param {any} err
 * @param {(key: string) => string} t  translator scoped to the `error` namespace
 * @returns {string}
 */
export function errorMessage(err, t) {
  // Offline / network unreachable — axios sets no `response`
  if (!err?.response) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return t("mapper.offline");
    }
    if (err?.code === "ECONNABORTED") {
      return t("mapper.timeout");
    }
    return t("mapper.network");
  }

  const status = err.response.status;
  const detail = err.response.data?.detail;

  // 4xx — the server had something to say
  if (status === 400 || status === 409 || status === 422) {
    // Prefer the server's Hebrew detail when it's a string, else generic
    return typeof detail === "string" && detail ? detail : t("mapper.bad_request");
  }
  if (status === 401) {
    return t("mapper.unauthorized");
  }
  if (status === 403) {
    return typeof detail === "string" && detail ? detail : t("mapper.forbidden");
  }
  if (status === 404) {
    return typeof detail === "string" && detail ? detail : t("mapper.not_found");
  }
  if (status === 429) {
    return t("mapper.rate_limited");
  }

  // 5xx — our problem
  if (status >= 500) {
    return t("mapper.server");
  }

  return t("generic");
}

/**
 * Convenience: map the error and show the toast in one call.
 *
 * @param {any} err
 * @param {(key: string) => string} t  translator scoped to the `error` namespace
 * @param {"error"|"info"} [type="error"]
 */
export function showErrorToast(err, t, type = "error") {
  // MEH-685: guard the dynamic dispatch — an unexpected `type` (anything
  // other than success/error/info) would be `undefined` post-shim and throw.
  // Fall back to `info` so a bad caller degrades gracefully instead of
  // crashing the catch branch it lives in.
  (showToast[type] ?? showToast.info)(errorMessage(err, t));
}
