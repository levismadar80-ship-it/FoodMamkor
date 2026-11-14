// @ts-check
/**
 * Module:   lib/first-moments
 * Purpose:  The once-only «רגע ראשון» cards on the dashboard home (MEH-3200
 *           part 2, approved by Sapir 14/11): first review, first WhatsApp
 *           click, 100 page views, first follower.
 * Touches:  nothing — pure logic. Storage (one JSON key per business,
 *           firstMomentsKey) is read and written in hooks/useFirstMoment.js.
 * Does NOT: render (components/producer/FirstMomentCard.jsx) or fetch — the
 *           counts come from GET /producers/me/analytics, already loaded by the
 *           dashboard home.
 * Rule:     the FIRST time the dashboard sees a count, it is stored silently
 *           (no card). A card shows only when a later count crosses the
 *           threshold that the stored count was below. A due card stays until
 *           the owner closes it or opens its button; either retires it for
 *           good (a celebration she may not have seen yet is not spent by one
 *           unread render).
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

const FIRST_MOMENTS_KEY = "mehamakor.first_moments";

/**
 * Storage key for one business: counts belong to a business, not a browser.
 * @param {string | number} producerId
 */
export function firstMomentsKey(producerId) {
  return `${FIRST_MOMENTS_KEY}.${producerId}`;
}

/** @typedef {{ baseline: Record<string, number>, done: string[] }} MomentState */

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
