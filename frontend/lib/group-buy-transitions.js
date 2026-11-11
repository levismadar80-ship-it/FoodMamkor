/**
 * Module:   group-buy-transitions
 * Purpose:  MEH-2868 — which status a group buy may move to, from each status,
 *           as the server enforces it. Used by /admin/group-buys to show only
 *           the buttons the server will accept.
 * Source:   OWNER_TRANSITIONS in backend/app/routers/group_buys.py; the admin
 *           route uses the same table since MEH-2866
 *           (ADMIN_TRANSITIONS = OWNER_TRANSITIONS).
 *           __tests__/AdminGroupBuysTransitions.test.jsx parses that file and
 *           fails if the two drift.
 */
// Cancelled and fulfilled are final: no moves, so no buttons.
export const ADMIN_NEXT_STATUSES = {
  open: ["cancelled"],
  funded: ["fulfilled", "cancelled"],
  cancelled: [],
  fulfilled: [],
};
