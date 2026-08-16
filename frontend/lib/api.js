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
});

// Attach JWT token to requests
api.interceptors.request.use((config) => {
  // MEH-1627: _noAuth marks the deliberate anonymous retry issued after a
  // failed refresh. Honour it structurally rather than relying on
  // _expireSession() having emptied localStorage first — otherwise a token
  // written by another tab mid-flight would re-authenticate a request whose
  // whole point is to carry no credentials.
  if (config._noAuth) {
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
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
}

// Handle errors: silent refresh on 401, report 5xx to Sentry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url ?? "";

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
      } catch {
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
