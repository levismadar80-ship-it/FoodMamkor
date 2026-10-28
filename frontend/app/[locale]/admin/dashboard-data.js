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
 *           pathname, so a count changed on one page is fresh on the next).
 * Shape:    { data, loadError, errorDetail }
 *           data        — the response body, or null (not loaded / failed)
 *           loadError   — true when the last fetch failed. MEH-2096: unknown
 *                         is not zero; consumers render "could not read".
 *           errorDetail — the backend `detail`, for the home's error line.
 * Does NOT: decide what is shown — admin/queues.js and the consumers do.
 */
const AdminDashboardContext = createContext(null);

export function AdminDashboardProvider({ enabled = true, refreshKey, children }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [errorDetail, setErrorDetail] = useState(null);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, refreshKey]);

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
