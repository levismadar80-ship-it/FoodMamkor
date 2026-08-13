/**
 * Module:   nav-registry
 * Purpose:  MEH-1703 chunk 1 — one declaration per navigation item, covering
 *           the four nav surfaces (desktop pill, desktop avatar dropdown,
 *           mobile bottom pill, mobile account sheet). Today it is INERT: it
 *           has zero consumers and exists so the equivalence test can pin what
 *           the three shells render, before any of them is wired to it.
 * Touches:  nothing. Pure data — no hooks, no I/O, no JSX, no imports.
 * Does NOT: render anything, decide styling, own order, or gate anything at
 *           runtime. Icons, icon sizes, wrapper classes, active-state chrome
 *           and tab order stay in the shells (Header.jsx, BottomNav.jsx,
 *           AccountSheet.jsx) — those are the fields that genuinely differ.
 *           It also does NOT cover the brand logo (a brand affordance, not a
 *           nav item) or the Footer's link groups (out of MEH-1703's scope).
 * Related:  components/Header.jsx (surfaces `header` + `headerMenu`),
 *           components/BottomNav.jsx (`bottomNav`),
 *           components/AccountSheet.jsx (`accountSheet`),
 *           __tests__/NavRegistryParity.test.jsx (the equivalence proof),
 *           lib/category-registry.js (MEH-1453 — the consolidation precedent).
 * History:  MEH-1703 (creation, chunk 1 — registry only, no consumers).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SHAPE NOTE — consolidate, don't fuse (the MEH-1453 lesson, applied)
 *
 * Each item carries ONE identity (`id`, and `href` for links) and a
 * `surfaces` map holding a SEPARATE record per shell. The per-surface records
 * sit side by side; they are deliberately NOT collapsed into one canonical
 * `labelKey` + `audience` pair.
 *
 * That is not tidiness — fusing would change rendered output, which is the
 * one thing this ticket forbids:
 *
 *   1. The home item uses `nav.explore` in the Header (Header.jsx:180) and
 *      `nav.discover` in the BottomNav (BottomNav.jsx:143). In he.json both
 *      render "גלו", so the split is INVISIBLE in Hebrew — but en.json has
 *      "Explore" vs "Discover", so picking one key would change what /en
 *      renders on one of the two surfaces. Header.jsx:171-173 records the
 *      split as deliberate (MEH-732, ADR-014).
 *   2. `favorites` and `settings` are auth-gated in the desktop dropdown
 *      (they live inside UserMenu, which only mounts for a logged-in user —
 *      Header.jsx:424) but UNGATED in the mobile sheet, where a guest sees
 *      both rows (AccountSheet.jsx:149-160). One shared `audience` would have
 *      to change one of the two surfaces.
 *
 * So `labelKey` and `audience` are per-surface. `href` is the shared field,
 * and it is the one this registry exists to make un-deletable in silence.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ASYMMETRIES RECORDED, NOT FIXED. Several items below appear on one shell
 * and not its counterpart. Each is described exactly as it ships today and
 * carries a `note`. MEH-1703 chunk 1 changes no behaviour; closing any of
 * these gaps is a separate decision, not this module's business.
 */

/** The four nav surfaces, and which component owns each. */
export const NAV_SURFACES = Object.freeze({
  /** Desktop pill's main link row — Header.jsx:385-396. */
  header: "components/Header.jsx",
  /** Desktop avatar dropdown — Header.jsx:569-586 (mounts only when signed in). */
  headerMenu: "components/Header.jsx",
  /** Mobile bottom pill's destination tabs — BottomNav.jsx:142-146. */
  bottomNav: "components/BottomNav.jsx",
  /** Mobile account sheet rows — AccountSheet.jsx:129-225. */
  accountSheet: "components/AccountSheet.jsx",
});

/**
 * Audience predicates, as data. The shells evaluate the equivalent condition
 * inline today; these names describe it without prescribing how it is read.
 *
 * `all`      — rendered regardless of auth state
 * `guest`    — only when signed out
 * `auth`     — only when signed in (any role)
 * `producer` — only for role === "producer"
 * `admin`    — only for role === "admin"
 * `consumer` — signed-out OR signed-in with neither producer nor admin role
 *              (BottomNav.jsx:133 `showAddBusinessCta`, the MEH-669 gate)
 */
export const NAV_AUDIENCES = Object.freeze([
  "all",
  "guest",
  "auth",
  "producer",
  "admin",
  "consumer",
]);

/**
 * `link`    — renders an anchor to `href`
 * `control` — renders a button/toggle with no destination (search, language,
 *             logout, and the account tab that opens the sheet). These are in
 *             the registry because one of the three incidents that motivated
 *             MEH-1703 was a CONTROL going missing: the desktop language
 *             toggle, absent for five weeks (MEH-1698).
 */
export const NAV_KINDS = Object.freeze(["link", "control"]);

export const NAV_ITEMS = Object.freeze([
  {
    id: "home",
    kind: "link",
    href: "/",
    surfaces: {
      header: { labelKey: "nav.explore", audience: "all" },
      bottomNav: { labelKey: "nav.discover", audience: "all" },
    },
    note:
      "Two different label keys on purpose (MEH-732 / ADR-014). Identical in " +
      "he.json ('גלו'), different in en.json ('Explore' / 'Discover').",
  },
  {
    id: "map",
    kind: "link",
    href: "/map",
    surfaces: {
      header: { labelKey: "nav.map", audience: "all" },
      bottomNav: { labelKey: "nav.map", audience: "all" },
    },
  },
  {
    id: "about",
    kind: "link",
    href: "/about",
    surfaces: {
      header: { labelKey: "nav.about", audience: "all" },
      bottomNav: { labelKey: "nav.about", audience: "all" },
    },
  },
  {
    id: "experiences",
    kind: "link",
    href: "/experiences",
    surfaces: {
      header: { labelKey: "nav.experiences", audience: "all" },
    },
    /**
     * Data-gated on top of its audience: `useExperiencesNavGate()`
     * (Header.jsx:178) hides it below EXPERIENCES_NAV_THRESHOLD upcoming
     * public experiences. Absent, never disabled.
     */
    dataGate: "experiences-supply",
    note:
      "Desktop only. use-experiences-nav-gate.js says the BottomNav is out of " +
      "scope because its four slots are full (MEH-1918).",
  },
  {
    id: "search",
    kind: "control",
    surfaces: {
      // Rendered twice inside Header — a desktop button (Header.jsx:406-412)
      // and a mobile-only circle (Header.jsx:458-464). One item, one surface:
      // the Header owns search at both widths, and no mobile shell duplicates
      // it. The two mounts differ only in wrapper classes, which stay local.
      header: { labelKey: "nav.search_label", audience: "all", mounts: 2 },
    },
  },
  {
    id: "language",
    kind: "control",
    surfaces: {
      header: { labelKey: null, audience: "all", variant: "default" },
      accountSheet: { labelKey: null, audience: "all", variant: "bare" },
    },
    note:
      "The MEH-1698 incident: removed from the Header in b7919b39 (21/06) and " +
      "missing for five weeks, leaving /en a one-way door on desktop. " +
      "LanguageToggle supplies its own aria-label, so there is no labelKey here.",
  },
  {
    id: "login",
    kind: "link",
    href: "/login",
    surfaces: {
      header: { labelKey: "nav.login", audience: "guest", suppressOnRoute: ["/login"] },
      accountSheet: { labelKey: "nav.login", audience: "guest" },
    },
  },
  {
    id: "register",
    kind: "link",
    href: "/register",
    surfaces: {
      header: {
        labelKey: "nav.register",
        audience: "guest",
        // Header.jsx:200-201 — exact match OR a "/register/" segment prefix.
        // Deliberately not a bare startsWith: a producer slug may legally
        // begin with those letters (MEH-1971).
        suppressOnRoute: ["/register", "/register/"],
      },
    },
    note: "Desktop only — no mobile shell offers consumer registration (MEH-1964).",
  },
  {
    id: "registerProducer",
    kind: "link",
    href: "/register/producer",
    surfaces: {
      accountSheet: { labelKey: "account.sheet.biz_cta", audience: "consumer" },
    },
    note:
      "Mobile only. MEH-907 removed the Header's add-business CTA on purpose; " +
      "the supply-side entry lives on the homepage CTA, the Footer and here.",
  },
  {
    id: "favorites",
    kind: "link",
    href: "/favorites",
    surfaces: {
      headerMenu: { labelKey: "nav.favorites", audience: "auth" },
      accountSheet: { labelKey: "nav.favorites", audience: "all" },
    },
    note:
      "Audience differs by surface, as shipped: the desktop row lives inside " +
      "UserMenu (signed-in only, Header.jsx:424/583), while the sheet renders " +
      "it unconditionally (AccountSheet.jsx:149-154), so a signed-out mobile " +
      "reader sees it. Recorded, not changed.",
  },
  {
    id: "settings",
    kind: "link",
    href: "/settings",
    surfaces: {
      headerMenu: { labelKey: "account.menu.settings", audience: "auth" },
      accountSheet: { labelKey: "account.menu.settings", audience: "all" },
    },
    note: "Same surface-dependent audience as `favorites` above.",
  },
  {
    id: "producerDashboard",
    kind: "link",
    href: "/producer/dashboard",
    surfaces: {
      headerMenu: { labelKey: "account.menu.dashboard", audience: "producer" },
      accountSheet: { labelKey: "account.menu.dashboard", audience: "producer" },
    },
  },
  {
    id: "producerPublicPage",
    kind: "link",
    // The only dynamic destination: `/producer/${user.producer_id}`
    // (Header.jsx:574). Held as a template because the registry is static data.
    href: "/producer/:producerId",
    surfaces: {
      headerMenu: { labelKey: "account.menu.profile", audience: "producer" },
    },
    /** Dropped entirely when the producer has no linked id (Header.jsx:573-575). */
    dataGate: "producer-id-present",
    note: "Desktop only — the mobile sheet has no public-page row (MEH-1226 / MEH-1228).",
  },
  {
    id: "admin",
    kind: "link",
    href: "/admin",
    surfaces: {
      headerMenu: { labelKey: "account.menu.admin", audience: "admin" },
    },
    note:
      "Desktop only. The mobile sheet offers an admin no route into /admin — " +
      "the same shape as MEH-1701, which found the admin queue counters " +
      "missing on mobile. Recorded, not changed.",
  },
  {
    id: "account",
    kind: "control",
    surfaces: {
      // The bottom pill's fourth tab. Not a route — it toggles AccountSheet
      // (BottomNav.jsx:410-452). Its label is the user's first name when
      // signed in, and nav.account for guests (BottomNav.jsx:449).
      bottomNav: { labelKey: "nav.account", audience: "all" },
    },
  },
  {
    id: "logout",
    kind: "control",
    surfaces: {
      headerMenu: { labelKey: "account.menu.logout", audience: "auth" },
      accountSheet: { labelKey: "account.menu.logout", audience: "auth" },
    },
  },
]);

/**
 * Items a surface declares for a given audience state.
 *
 * Pure lookup over the data above — no rendering opinion. `dataGate` items are
 * INCLUDED: the gate is a runtime supply/ownership question this module cannot
 * answer, so callers (today: only the parity test) decide.
 *
 * @param {string} surface one of the NAV_SURFACES keys
 * @param {{ signedIn?: boolean, role?: string|null }} [state]
 * @returns {Array<{item: object, surface: object}>} in declaration order
 */
export function itemsForSurface(surface, state = {}) {
  const { signedIn = false, role = null } = state;
  const matches = (audience) => {
    switch (audience) {
      case "all":
        return true;
      case "guest":
        return !signedIn;
      case "auth":
        return signedIn;
      case "producer":
        return signedIn && role === "producer";
      case "admin":
        return signedIn && role === "admin";
      case "consumer":
        return role !== "producer" && role !== "admin";
      default:
        // An unknown audience is a typo in the data, not a "no". Fail loudly
        // rather than silently dropping the item from every surface.
        throw new Error(`nav-registry: unknown audience "${audience}"`);
    }
  };

  return NAV_ITEMS.filter((item) => item.surfaces[surface])
    .filter((item) => matches(item.surfaces[surface].audience))
    .map((item) => ({ item, surface: item.surfaces[surface] }));
}
