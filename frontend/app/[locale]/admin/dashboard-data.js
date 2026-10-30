"use client";

import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

/**
 * Module:   admin/dashboard-data
 * Purpose:  MEH-2399 — the ONE owner of `GET /admin/dashboard` for the admin
 *           shell. The layout (sidebar badges + queue filter) and the home
 *           page («מה מחכה לטיפול») read the same response; before this each
 *           fetched it, so landing on /admin cost two identical requests.
 *           The provider fetches once per admin navigation (`refreshKey` =
 *           pathname, so a count changed on one page is fresh on the next)
 *           and again after any successful admin write (MEH-2602: approving
 *           a business left the sidebar badge at its old count until reload).
 * Shape:    { data, loadError, errorDetail }
 *           data        — the response body, or null (not loaded / failed)
 *           loadError   — true when the last fetch failed. MEH-2096: unknown
 *                         is not zero; consumers render "could not read".
 *           errorDetail — the backend `detail`, for the home's error line.
 * Does NOT: decide what is shown — admin/queues.js and the consumers do.
 */
const AdminDashboardContext = createContext(null);

/** True for a request URL under /admin/ (relative or absolute). */
export function isAdminWrite(url) {
  if (!url) return false;
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api(?=\/)/, "");
  return path.startsWith("/admin/");
}

export function AdminDashboardProvider({ enabled = true, refreshKey, children }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [errorDetail, setErrorDetail] = useState(null);
  // MEH-2602: bumped after a successful POST/PUT/PATCH/DELETE to /admin/*,
  // so the badges follow an approve/reject on the same page. One interceptor
  // instead of a call in every queue page; writes in a burst coalesce.
  const [writeTick, setWriteTick] = useState(0);

  useEffect(() => {
    // A stubbed client (unit tests) has no interceptors; the badges then
    // simply refresh per navigation, as before.
    if (!enabled || !api.interceptors?.response) return undefined;
    let timer = null;
    const id = api.interceptors.response.use((res) => {
      const method = (res?.config?.method || "get").toLowerCase();
      if (method !== "get" && isAdminWrite(res?.config?.url)) {
        clearTimeout(timer);
        timer = setTimeout(() => setWriteTick((n) => n + 1), 300);
      }
      return res;
    });
    return () => {
      clearTimeout(timer);
      api.interceptors.response.eject(id);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      // Logged out / not an admin: drop what an earlier admin session loaded,
      // so a later login never starts from it.
      setData(null);
      setLoadError(false);
      setErrorDetail(null);
      return;
    }
    // A retry starts without the previous failure: the home shows its loading
    // state, not an old error, while the new request is in flight. `data` is
    // left alone — clearing it would read as "unknown" and flash every queue.
    setLoadError(false);
    setErrorDetail(null);
    let cancelled = false;
    api
      .get("/admin/dashboard")
      .then((r) => {
        if (cancelled) return;
        setData(r.data ?? null);
        setLoadError(false);
        setErrorDetail(null);
      })
      .catch((e) => {
        if (cancelled) return;
        // Counts stay null (no fabricated number); loadError carries the
        // distinction from a genuine zero (MEH-2096).
        setData(null);
        setErrorDetail(e?.response?.data?.detail ?? null);
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey, writeTick]);

  return (
    <AdminDashboardContext.Provider value={{ data, loadError, errorDetail }}>
      {children}
    </AdminDashboardContext.Provider>
  );
}

/** Read the shared /admin/dashboard state. Must sit under AdminDashboardProvider. */
export function useAdminDashboard() {
  const ctx = useContext(AdminDashboardContext);
  if (!ctx) throw new Error("useAdminDashboard must be used inside AdminDashboardProvider");
  return ctx;
}
