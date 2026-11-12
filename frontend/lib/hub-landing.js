/**
 * Module:   hub-landing
 * Purpose:  MEH-2975 — where a link to the listing hub should land. The hub is
 *           four routes under one tab row (ListingHubTabs); a link that always
 *           opened /events showed an empty events tab whenever the supply was
 *           in one of the other three.
 * Touches:  nothing — a pure function of the four supply-gate answers the
 *           caller already holds (Header.jsx, BottomNav.jsx).
 * Does NOT: decide whether the link exists (the callers' `listing-supply`
 *           gate does), and does not fetch.
 * Related:  components/ListingHubTabs.jsx (HUB_TABS — the same order).
 */

// Tab order, first to last. Kept beside the function rather than imported from
// ListingHubTabs so the nav shells do not pull a client component for a list
// of four strings; `__tests__/HubLanding.test.js` pins the two to each other.
export const HUB_LANDING_ORDER = Object.freeze([
  { gate: "events", href: "/events" },
  { gate: "experiences", href: "/experiences" },
  { gate: "groupBuys", href: "/group-buys" },
  { gate: "rescue", href: "/rescue" },
]);

/**
 * The first hub route whose type has supply. With nothing known (every gate
 * closed: loading, or the backend unreachable) it is /events, the hub's own
 * default.
 *
 * @param {{events?: boolean, experiences?: boolean, groupBuys?: boolean, rescue?: boolean}} supply
 * @returns {string}
 */
export function hubLandingHref(supply) {
  const first = HUB_LANDING_ORDER.find(({ gate }) => Boolean(supply?.[gate]));
  return first ? first.href : "/events";
}
