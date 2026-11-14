// @ts-check
/**
 * Module:   lib/first-moments
 * Purpose:  The once-only «רגע ראשון» cards on the dashboard home (MEH-3200
 *           part 2, approved by Sapir 14/11): first review, first WhatsApp
 *           click, 100 page views, first follower.
 * Touches:  window.localStorage (one JSON key, every access in try/catch).
 * Does NOT: render (components/producer/FirstMomentCard.jsx) or fetch — the
 *           counts come from GET /producers/me/analytics, already loaded by the
 *           dashboard home.
 * Rule:     the FIRST time the dashboard sees a count, it is stored silently
 *           (no card). A card shows only when a later count crosses the
 *           threshold that the stored count was below, and each moment shows
 *           once: closing it, or opening its button, retires it for good.
 * History:  MEH-3200 part 2 (creation).
 */

/**
 * @typedef {{ key: string, threshold: number, href: string, read: (a: any) => number }} Moment
 */

/** In priority order — when two cross on the same visit, the first wins. */
/** @type {Moment[]} */
export const MOMENTS = [
  { key: "first_review", threshold: 1, href: "/producer/dashboard/reviews", read: (a) => a?.total_reviews },
  { key: "first_whatsapp", threshold: 1, href: "/producer/dashboard/insights", read: (a) => a?.whatsapp_clicks?.total },
  { key: "views_100", threshold: 100, href: "/producer/dashboard/insights", read: (a) => a?.profile_views?.total },
  { key: "first_follower", threshold: 1, href: "/producer/dashboard/insights", read: (a) => a?.follower_count },
];

export const FIRST_MOMENTS_KEY = "mehamakor.first_moments";

/** @typedef {{ baseline: Record<string, number>, done: string[] }} MomentState */

/** @returns {MomentState | null} null = never stored (first visit) or unreadable. */
export function readMomentState() {
  try {
    const raw = window.localStorage.getItem(FIRST_MOMENTS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object" || typeof s.baseline !== "object" || !Array.isArray(s.done)) return null;
    return s;
  } catch {
    return null;
  }
}

/** @param {MomentState} state */
export function writeMomentState(state) {
  try {
    window.localStorage.setItem(FIRST_MOMENTS_KEY, JSON.stringify(state));
  } catch {
    // blocked storage: no card is ever due, because nothing has a baseline
  }
}

/** @param {unknown} v */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Pure step: given the stored state and fresh analytics, return the state to
 * store and the moment due now (or null).
 * @param {MomentState | null} state
 * @param {any} analytics
 * @returns {{ state: MomentState, due: Moment | null }}
 */
export function stepMoments(state, analytics) {
  const next = {
    baseline: { ...(state?.baseline ?? {}) },
    done: [...(state?.done ?? [])],
  };
  let due = null;
  for (const m of MOMENTS) {
    const value = num(m.read(analytics));
    if (value === null) continue;
    if (!(m.key in next.baseline)) {
      // First sight of this count: store it, never celebrate it.
      next.baseline[m.key] = value;
      if (value >= m.threshold) next.done.push(m.key);
      continue;
    }
    if (next.done.includes(m.key)) continue;
    if (!due && next.baseline[m.key] < m.threshold && value >= m.threshold) due = m;
  }
  return { state: next, due };
}

/**
 * Retire a moment for good.
 * @param {MomentState | null} state
 * @param {string} key
 * @returns {MomentState}
 */
export function retireMoment(state, key) {
  const done = new Set(state?.done ?? []);
  done.add(key);
  return { baseline: { ...(state?.baseline ?? {}) }, done: [...done] };
}
