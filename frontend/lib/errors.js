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

// MEH-957: Pydantic v2 prefixes every custom-validator message raised via
// `raise ValueError(...)` with this literal in the `msg` field. Stripped so
// the Hebrew sentence renders clean instead of "Value error, <hebrew>".
const PYDANTIC_VALUE_ERROR_PREFIX = "Value error, ";

// MEH-1164 sub-chunk B: the backend's verified-email gate (auth.py
// require_verified_email / require_verified_producer) raises a 403 whose
// `detail` is {code: "email_unverified", message: <Hebrew>}. Mirrored here so
// the four producer create forms can detect it and render the resend CTA
// instead of a dead-end error string.
export const EMAIL_UNVERIFIED_CODE = "email_unverified";
// Transition fallback: before the code field existed the detail was this bare
// Hebrew string. Matching it too keeps detection working against any endpoint
// or cached client that still emits the old shape.
const EMAIL_UNVERIFIED_MESSAGE = "יש לאמת את כתובת האימייל תחילה";

/**
 * True when an axios-shaped error is the verified-email 403 gate.
 *
 * Prefers the stable `detail.code` (locale-neutral); falls back to the legacy
 * bare-string `detail` for transition safety. Any other error — including a
 * non-403 or a different 403 (e.g. "Producer access required") — returns false
 * so the caller keeps its existing error path untouched.
 *
 * @param {any} err  axios error (expects `err.response.status` + `.data.detail`)
 * @returns {boolean}
 */
export function isUnverifiedEmailError(err) {
  if (err?.response?.status !== 403) return false;
  const detail = err.response.data?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return detail.code === EMAIL_UNVERIFIED_CODE;
  }
  return detail === EMAIL_UNVERIFIED_MESSAGE;
}

// MEH-1940: the same-town location 422. Backend returns
// {code, message, params} — the MEH-1164 shape above — so the copy can be
// rendered from messages/*.json instead of shipping a Hebrew sentence from the
// router. `params` describes the location that ALREADY exists, which is what
// lets the message name it rather than invent a label example.
export const LOCATION_SAME_CITY_CODE = "location_same_city_needs_label";

/**
 * Params for the same-town location error, or `null` for anything else.
 *
 * Same shape as `isUnverifiedEmailError`: match on the stable `code`, never on
 * the Hebrew string. A caller that gets `null` keeps its existing path — which
 * for a pre-`code` backend means falling through to `detailToMessage`, and that
 * still yields the bare `message`. That fallback is the transition safety.
 *
 * @param {unknown} detail  `err.response.data.detail`
 * @returns {{city: string|null, existing_kind: string|null,
 *            existing_label: string|null, existing_count: number} | null}
 */
export function sameCityLabelParams(detail) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  if (detail.code !== LOCATION_SAME_CITY_CODE) return null;
  return detail.params ?? {};
}

/**
 * MEH-957 — normalise a FastAPI `detail` payload to a single display string.
 *
 * FastAPI returns three `detail` shapes:
 *   - 400/409/403 (HTTPException) → `detail` is a string.
 *   - 422 (RequestValidationError) → `detail` is an ARRAY of error objects
 *     (`{type, loc, msg, input}`), each `msg` Pydantic-prefixed with
 *     "Value error, " for custom-validator failures.
 *
 * Rendering the raw array as a React child crashes the tree ("Objects are
 * not valid as a React child" — the MEH-957 register white-screen). This
 * helper collapses the array into a `" · "`-joined sentence and strips the
 * Pydantic prefix. Returns `null` for any shape it can't turn into text so
 * callers fall back to their own generic copy.
 *
 * @param {unknown} detail  `err.response.data.detail`
 * @returns {string | null}
 */
export function detailToMessage(detail) {
  if (typeof detail === "string") {
    return detail || null;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => (typeof item?.msg === "string" ? item.msg : ""))
      .map((msg) =>
        msg.startsWith(PYDANTIC_VALUE_ERROR_PREFIX)
          ? msg.slice(PYDANTIC_VALUE_ERROR_PREFIX.length)
          : msg,
      )
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  return null;
}

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
    // MEH-959: detailToMessage handles both the string (400/409) and the
    // 422 array (RequestValidationError) shapes, so a validation error now
    // surfaces its Hebrew message instead of collapsing to the generic copy.
    return detailToMessage(detail) || t("mapper.bad_request");
  }
  if (status === 401) {
    return t("mapper.unauthorized");
  }
  if (status === 403) {
    return detailToMessage(detail) || t("mapper.forbidden");
  }
  if (status === 404) {
    return detailToMessage(detail) || t("mapper.not_found");
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
