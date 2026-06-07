"use client";

/**
 * Module:   launch-cohort
 * Purpose:  Tag launch-window (month-1) sessions in Sentry so launch users
 *           can be filtered apart from later/random traffic in Replay.
 * Touches:  Sentry (setTag only — no setUser, no PII).
 * Does NOT: read/write the backend. The cohort is derived CLIENT-SIDE from
 *           the user's created_at (already on UserOut → /auth/me,
 *           backend/app/schemas/schemas.py:752), so this slice needs no
 *           route/schema change. The server-side UserOut.launch_cohort path
 *           from the MEH-434 plan is DEFERRED (see docs/LAUNCH_OBSERVABILITY.md).
 * Related:  frontend/lib/auth-context.js (calls useLaunchCohortTag),
 *           frontend/sentry.client.config.js (Replay init).
 * History:  MEH-434 (creation — client-side tag slice).
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// MEH-434 — launch-cohort tagging window. Bump LAUNCH_START on go-live day
// in a small dedicated PR (~5 min); LAUNCH_END auto-derives. No env var by
// design — the launch date is a one-time decision (matches the Linear
// "Forbidden: no new env var" constraint).
const LAUNCH_START = new Date("2026-05-15T00:00:00Z"); // TBD — Sapir updates on launch day
const COHORT_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAUNCH_END = new Date(LAUNCH_START.getTime() + COHORT_WINDOW_DAYS * DAY_MS);

/**
 * Map a user's created_at to the Sentry launch-cohort tag value.
 * Returns "month_1" when created within [LAUNCH_START, LAUNCH_END), else null.
 * Missing / invalid input → null. Never throws.
 *
 * @param {string|number|Date|null|undefined} createdAt
 * @returns {"month_1"|null}
 */
export function computeLaunchCohort(createdAt) {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return null;
  return t >= LAUNCH_START.getTime() && t < LAUNCH_END.getTime() ? "month_1" : null;
}

/**
 * Side-effect hook — sets/clears the Sentry `launch_cohort` tag whenever the
 * authenticated user changes. Only the cohort label is sent (never email,
 * name, phone, or city) and only setTag is used (never setUser), per the
 * MEH-434 Forbidden list. Logged-out (user === null) clears the tag.
 *
 * @param {{ created_at?: string } | null} user
 */
export function useLaunchCohortTag(user) {
  useEffect(() => {
    Sentry.setTag("launch_cohort", computeLaunchCohort(user?.created_at));
  }, [user]);
}

export { LAUNCH_START, LAUNCH_END };
