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
 * History:  MEH-2975 (creation); MEH-3125 (two groups: «אירועים» and «הזדמנויות»).
 */

// Tab order, first to last. A second copy of ListingHubTabs' HUB_TABS order,
// kept here so this module stays a pure function with no component import;
// `__tests__/HubLanding.test.js` pins the two to each other.
//
// MEH-3125: the four routes are TWO groups now, each with its own nav entry —
// «אירועים» (events + experiences) and «הזדמנויות» (group buys + rescue
// bags). `group` names the entry a route belongs to.
export const HUB_GROUPS = Object.freeze({ whatsOn: "whatsOn", opportunities: "opportunities" });
export const HUB_LANDING_ORDER = Object.freeze([
  { gate: "events", href: "/events", group: HUB_GROUPS.whatsOn },
  { gate: "experiences", href: "/experiences", group: HUB_GROUPS.whatsOn },
  { gate: "groupBuys", href: "/group-buys", group: HUB_GROUPS.opportunities },
  { gate: "rescue", href: "/rescue", group: HUB_GROUPS.opportunities },
]);

// No group given = all four routes (the pre-MEH-3125 single hub). Anything
// that is not a group name counts as none — these functions are passed to
// `.map`, which hands them an index as the second argument.
const inGroup = (group) => {
  const known = Object.values(HUB_GROUPS).includes(group);
  return HUB_LANDING_ORDER.filter((entry) => !known || entry.group === group);
};

/**
 * The first route of the group whose type has supply. With nothing known
 * (every gate closed: loading, or the backend unreachable) it is the group's
 * own first route.
 *
 * @param {{events?: boolean, experiences?: boolean, groupBuys?: boolean, rescue?: boolean}} supply
 * @param {string} [group] a HUB_GROUPS value; omitted = all four routes
 * @returns {string}
 */
export function hubLandingHref(supply, group) {
  const entries = inGroup(group);
  const first = entries.find(({ gate }) => Boolean(supply?.[gate]));
  return first ? first.href : entries[0].href;
}

/** The group a hub tab value belongs to, or null for a value outside the hub. */
export function hubGroupOf(gate) {
  return HUB_LANDING_ORDER.find((entry) => entry.gate === gate)?.group ?? null;
}

/**
 * True on any of the four hub routes and their sub-routes. Segment boundary,
 * not a bare prefix: `/eventsx` is a business slug, not the hub (the MEH-1971
 * lesson in Header.jsx).
 *
 * @param {string|null|undefined} pathname locale-stripped pathname
 * @param {string} [group] a HUB_GROUPS value; omitted = all four routes
 * @returns {boolean}
 */
export function isHubPath(pathname, group) {
  if (!pathname) return false;
  return inGroup(group).some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
}

/** True when `href` is one of the hub routes (a hub link's own target). */
export function isHubHref(href, group) {
  return inGroup(group).some((entry) => entry.href === href);
}
