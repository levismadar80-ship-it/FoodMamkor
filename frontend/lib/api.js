// @ts-check
import axios from "axios";
import * as Sentry from "@sentry/nextjs";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  // MEH-1465: render array query params as repeated keys (?category=1&category=2),
  // NOT axios's default bracket form (?category[]=1). FastAPI's `list[int]` query
  // parsing reads repeated bare keys; the bracketed form is silently ignored,
  // which would drop a multi-id category filter. Applies to every array param.
  paramsSerializer: { indexes: null },
  // MEH-3193: no request waits forever. Before this, a stalled backend left
  // /events, /experiences and /map on skeletons with no message (measured
  // 20 s stall, 14/11); after 15 s the page's own error state takes over.
  timeout: 15000,
});

// MEH-3193: a file upload is not "a stalled backend" — a multi-MB photo on a
// slow phone connection can need far longer than 15 s (the trap MEH-2396
// recorded in EventsClient). FormData bodies get 2 minutes unless the caller
// set its own timeout.
export const UPLOAD_TIMEOUT_MS = 120000;

// MEH-3399: uploads go through Vercel's `/api` proxy, which answers any body
// above ~4.5MB with its own English plain-text 413 (FUNCTION_PAYLOAD_TOO_LARGE,
// measured on staging 18/11) before the backend's Hebrew 413 (#4725) can be
// sent. So the cap is enforced here, below Vercel's: a file above 4MB never
// leaves the browser, and any 413 that does come back carries one Hebrew line.
import { MAX_UPLOAD_BYTES, uploadTooLargeDetail } from "./upload-limits";
export { MAX_UPLOAD_BYTES, uploadTooLargeDetail };

/** @param {unknown} data */
function oversizedUpload(data) {
  if (typeof FormData === "undefined" || !(data instanceof FormData)) return false;
  for (const [, value] of data.entries()) {
    if (typeof Blob !== "undefined" && value instanceof Blob && value.size > MAX_UPLOAD_BYTES) {
      return true;
    }
  }
  return false;
}

// Attach JWT token to requests
api.interceptors.request.use((config) => {
  if (oversizedUpload(config.data)) {
    // Shaped like an axios response error so every caller's existing
    // `err.response?.data?.detail` path shows the Hebrew line.
    return uploadTooLargeDetail().then((detail) =>
      Promise.reject(
        Object.assign(new Error("upload too large"), {
          config,
          response: { status: 413, data: { detail } },
        }),
      ),
    );
  }
  if (
    typeof FormData !== "undefined" &&
    config.data instanceof FormData &&
    config.timeout === 15000
  ) {
    config.timeout = UPLOAD_TIMEOUT_MS;
  }
  // MEH-1627: _noAuth marks the deliberate anonymous retry issued after a
  // failed refresh. Honour it structurally rather than relying on
  // _expireSession() having emptied localStorage first — otherwise a token
  // written by another tab mid-flight would re-authenticate a request whose
  // whole point is to carry no credentials.
  if (/** @type {typeof config & { _noAuth?: boolean }} */ (config)._noAuth) {
    delete config.headers.Authorization;
    return config;
  }
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// MEH-326: in-flight refresh dedup — concurrent 401s share one /auth/refresh call.
let refreshPromise = null;

// URLs where a 401 must NOT trigger a refresh attempt (auth endpoints themselves).
const SKIP_REFRESH = [
  "/auth/refresh",
  "/auth/login",
  "/auth/register",
  "/auth/register/producer",
  "/auth/register/producer/oauth",
  "/auth/google",
  "/auth/apple",
  // MEH-3305: the second sign-in step has no session yet to refresh.
  "/auth/passkey/login",
  "/auth/logout",
];

// MEH-1627: endpoints whose path SITS UNDER a SKIP_REFRESH prefix but whose
// 401 is genuinely refreshable, so the prefix match must not swallow them.
//
// POST /auth/register/producer is dual-mode (routers/auth.py:392): anonymous
// registration, or an upgrade for a logged-in consumer. Anonymous callers send
// no Authorization header and so can never receive a 401 from the auth layer —
// which means a 401 from this endpoint has exactly one cause, an invalid Bearer
// token on the upgrade path. That is the textbook refresh case, and it is the
// launch blocker MEH-1627 closes: before this, "/auth/register" AND
// "/auth/register/producer" both prefix-matched here, so the interceptor
// skipped the refresh and the expired-token upgrade died at the 422.
//
// Matched EXACTLY, not by prefix: "/auth/register/producer/oauth" is a
// different endpoint (routers/auth.py:822) that takes no optional auth, and it
// must stay skipped.
const REFRESH_ALLOWED_EXACT = new Set(["/auth/register/producer"]);

function _expireSession() {
  // MEH-3173: announce the expiry only if there WAS a session to end. Several
  // requests in flight together (the home page fires 5+ GETs at once) all
  // 401, share one refresh, and each one lands here when it fails. The first
  // call clears the stored session; every later call finds nothing to end and
  // stays silent — one auth:expired, one toast, not five. A guest with no
  // stored session never gets a "session expired" notice at all.
  // Every sign-in path stores `token`, so its presence is the session.
  const hadSession = localStorage.getItem("token") !== null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (hadSession && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
}

// Handle errors: silent refresh on 401, report 5xx to Sentry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url ?? "";

    // MEH-3399: a 413 on an upload (Vercel's plain text, the backend's JSON)
    // reaches the caller as the same Hebrew detail. Only FormData bodies: a
    // 413 on any other request keeps the backend's own generic line.
    if (
      status === 413 &&
      typeof FormData !== "undefined" &&
      error.config?.data instanceof FormData
    ) {
      return uploadTooLargeDetail().then((detail) => {
        error.response.data = { detail };
        return Promise.reject(error);
      });
    }

    // MEH-1627: the exact-match allowlist wins over the prefix skip-list.
    const path = url.split("?")[0];
    const skipRefresh =
      !REFRESH_ALLOWED_EXACT.has(path) &&
      SKIP_REFRESH.some((prefix) => url.startsWith(prefix));

    if (status === 401 && typeof window !== "undefined" && !skipRefresh) {
      // MEH-1315: retry-once guard — a request that already retried after a
      // successful refresh must not trigger a second refresh (infinite
      // refresh→retry→401 loop when the retry keeps failing, e.g. corrupt
      // fingerprint cookie / clock skew).
      if (error.config?._retry) {
        // MEH-1627: the anonymous retry already ran _expireSession() before
        // it was issued — don't fire a second auth:expired (double toast).
        if (!error.config._noAuth) {
          _expireSession();
        }
        return Promise.reject(error);
      }
      try {
        if (!refreshPromise) {
          refreshPromise = api.post("/auth/refresh");
        }
        const res = await refreshPromise;
        localStorage.setItem("token", res.data.access_token);
        // Retry the original request — config already has the old Bearer
        // header; the request interceptor will overwrite it with the new
        // token on the retry because it reads localStorage fresh each time.
        error.config._retry = true;
        return api(error.config);
      } catch (refreshErr) {
        // MEH-2467: only a server VERDICT on the refresh (401/403) ends the
        // session. A refresh that never reached the server, timed out, or
        // met a 5xx says nothing about the credentials — discarding the
        // token on it logged the admin out during a Railway redeploy with
        // no 401 anywhere in the logs. Reject with the refresh error (the
        // caller sees "could not reach the server", which is the truth) and
        // leave token, cookie and user untouched: the next 401 refreshes again.
        const verdict = refreshErr?.response?.status;
        if (verdict !== 401 && verdict !== 403) {
          return Promise.reject(refreshErr);
        }
        _expireSession();
        // MEH-1627: the session is gone, but the resource may well be public
        // — a guest browsing with a stale localStorage token was previously
        // shown an error for a page that renders fine anonymously. Retry once
        // with no credentials so the guest sees the public view.
        //
        // GET ONLY, by design. A POST replayed without auth is not the same
        // request: POST /auth/register/producer sans Bearer takes the
        // new-registration branch and 422s on the absent email
        // (routers/auth.py:575-580) — precisely the bug this ticket closes,
        // re-created as an honest-looking success path. Never widen this to
        // non-idempotent verbs.
        if ((error.config?.method ?? "get").toLowerCase() === "get") {
          const anonConfig = {
            ...error.config,
            headers: { ...error.config.headers },
            _retry: true,
            _noAuth: true,
          };
          delete anonConfig.headers.Authorization;
          return api(anonConfig);
        }
        return Promise.reject(error);
      } finally {
        refreshPromise = null;
      }
    }

    if (status >= 500 || !error.response) {
      Sentry.captureException(error, {
        extra: {
          url: error.config?.url,
          method: error.config?.method,
          status,
        },
      });
    }
    return Promise.reject(error);
  }
);

export default api;
