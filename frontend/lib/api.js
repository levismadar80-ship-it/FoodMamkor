import axios from "axios";
import * as Sentry from "@sentry/nextjs";

const api = axios.create({
  baseURL: "/api",
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

// Handle errors: clear auth on 401, report 5xx to Sentry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401 && typeof window !== "undefined") {
      const hadToken = !!localStorage.getItem("token");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // Only fire when a token existed — distinguishes "session expired"
      // from "unauthenticated request with no token".
      if (hadToken) {
        window.dispatchEvent(new CustomEvent("auth:expired"));
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
