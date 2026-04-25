import axios from "axios";
import * as Sentry from "@sentry/nextjs";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Attach JWT token to requests
api.interceptors.request.use((config) => {
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

    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !SKIP_REFRESH.some((prefix) => url.startsWith(prefix))
    ) {
      try {
        if (!refreshPromise) {
          refreshPromise = api.post("/auth/refresh");
        }
        const res = await refreshPromise;
        localStorage.setItem("token", res.data.access_token);
        // Retry the original request — config already has the old Bearer
        // header; the request interceptor will overwrite it with the new
        // token on the retry because it reads localStorage fresh each time.
        return api(error.config);
      } catch {
        _expireSession();
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
