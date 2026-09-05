import { test, expect, type Page } from "../_cloudinary-stub";

/**
 * Spec:     manual/dashboard-shell — MEH-1249 chunk 11a of 12
 * Purpose:  Convert the CONVERT-verdict rows of six MANUAL_TESTING sections
 *           covering the producer-dashboard SHELL and its read-only tabs:
 *             MT:MEH-964-1A     nested-route shell (tab nav + the one UX gate)
 *             MT:MEH-964-1B     the locked 4-KPI strip on Overview
 *             MT:MEH-1134       state-conditional card order
 *             MT:MEH-1101       insights zero-state + low-n lists
 *             MT:MEH-1102       tools tab grid
 *             MT:MEH-1599       "אין לך גישה" in place of a silent redirect
 * Touches:  NO backend. /auth/me, /favorites, /producers/me{,/dashboard,
 *           /analytics} are route-mocked and the session token is seeded via
 *           addInitScript, exactly as flows/34-draft-submit-review does. So
 *           this runs on the DEFAULT CI E2E target (localhost:3000) and needs
 *           no DEMO_* fixture and no storageState.
 * Does NOT: write anything, anywhere. Every authenticated spec that uses the
 *           real storageState fixtures talks to the RAILWAY STAGING backend
 *           (.github/workflows/e2e.yml:229-233), so a mutating assertion there
 *           would be a write against staging — which Sapir's 13/07 ruling
 *           forbids. Read-only rendering is the whole scope here; the edit
 *           tab's writes are chunk 11b/11c and stay reported, not converted.
 * Related:  app/[locale]/producer/dashboard/layout.js · page.js ·
 *           insights/page.js · tools/page.js · flows/34 (the stub pattern) ·
 *           flows/25-role-reachability (the storageState counterpart).
 * History:  MEH-1249 chunk 11a.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 * e2e/CLAUDE.md bans mocks in `flows/` (MEH-417) except where all three of the
 * MEH-1968 conditions hold. They are stated here because the rule requires them
 * stated, not assumed:
 *
 *   1. No backend BEHAVIOUR is asserted. Every test here asks which screen the
 *      client renders for a given payload — the denied state vs the redirect,
 *      the KPI strip vs the zero-state, the card order — never whether the
 *      server computed the payload correctly.
 *   2. The contracts are stable and pinned server-side: /producers/me,
 *      /producers/me/dashboard and /producers/me/analytics all have Pydantic
 *      response models, and flows/34-draft-submit-review already intercepts
 *      this exact set for this exact reason.
 *   3. The unmocked alternative burns a shared resource, and worse than the
 *      rate-limiter case the rule cites. Reaching these states for real means
 *      MUTATING the Railway staging backend the authenticated specs share
 *      (.github/workflows/e2e.yml:229-233) — flipping a business to `pending`,
 *      emptying its categories, zeroing its analytics. That is a destructive
 *      write against shared staging, which Sapir's 13/07 ruling forbids
 *      outright. There is no non-mocking way to assert a `pending` dashboard.
 *
 * The Cloudinary import is the suite-wide STUB (MEH-1925), not part of this.
 *
 * ─── Why the fixtures are VERIFIED and not assumed ─────────────────────────
 *
 * `producer-overview` carries `data-state-approved`, `data-state-complete` and
 * `data-state-active` (page.js:450-452), which the Overview computes from the
 * very payloads these stubs return. Every test that depends on a state asserts
 * that attribute FIRST, as a fixture precondition, before reading any UI.
 *
 * That ordering is the #3403 lesson applied up front: a hand-built fixture that
 * silently fails to produce the intended state makes the UI assertion fail with
 * a message accusing the UI. Here the precondition fails instead, and says so.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-964-1A:1 says a non-producer is redirected to /login. That is
 *      STALE and it is stale by DESIGN: MEH-1599 deliberately split 401 from
 *      403 (layout.js:105-125). An authenticated consumer now stays on the URL
 *      and gets the denied state. The two sections contradict each other in the
 *      same file; MEH-1599 is the newer truth and is what is asserted.
 * D2 · MT:MEH-1102:1 says the tools grid shows exactly 4 cards and names
 *      "הצגת העסק באתר" as one of them. Measured: FIVE cards, and that one is
 *      not among them — MEH-1357 removed it (tools/page.js:120-122) in favour
 *      of the persistent "צפייה בדף" link in the shell nav. Both the count and
 *      the membership are wrong. The count is asserted at its measured value.
 * D3 · MT:MEH-1134:2 asserts that an approved+complete business shows the
 *      completeness card BELOW availability. MEH-1397 deleted that slot
 *      (page.js:800-812): the card now mounts ONLY in the completenessFirst
 *      slot, so in that state it does not render AT ALL. The row describes a
 *      card that cannot appear, and its neighbour :3 ("exactly one instance")
 *      is thereby trivially true. Asserted as absence, which is the behaviour.
 * D4 · MT:MEH-964-1B:1-2 and row 3 name KPI copy that has since changed: the doc's
 *      "פניות בוואטסאפ" / "צרי קשר" are today "קליקים בוואטסאפ" / "קליקים
 *      ליצירת קשר (בלי וואטסאפ)", and the conversion line's "X% מהצופות פנו
 *      אלייך" is now a longer sentence that ends "קליק אינו בהכרח פנייה
 *      שנשלחה." The rewrite reads as a deliberate precision fix (a click is
 *      not an inquiry), so this is reported as copy drift, not as a bug. The
 *      ORDER the doc locks is unchanged and IS asserted.
 * D5 · MT:MEH-964-1B:1 describes the 2×2 strip unconditionally. It is
 *      conditional: with no activity at all, MEH-1345 substitutes
 *      `overview-zero-state` and the strip does not render (page.js:832-848).
 *      The doc names neither the substitution nor that state. Both branches are
 *      asserted here — this is the 5-state rule applied to a row that reads as
 *      if it had one state.
 *
 * NOT drift, and deliberately left alone: row 6 of MEH-964 1A says the תובנות tab
 * is absent "in 1A". That is a statement about a shipping increment, not about
 * today's app, and the 1B section immediately below it adds the tab. Nothing to
 * correct.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * MT:MEH-1355 is in this chunk's page group per docs/qa/conversion-page-map.md,
 * but every one of its three rows is about `/settings` → טאב "העסק שלי", not
 * about /producer/dashboard at all. Re-homed, not converted — the page map's
 * assignment is what is wrong, not the rows.
 *
 * MT:MEH-1115 ("מה זה?" explainers) lives on the edit tab and the group-buys
 * page. It belongs to chunk 11b, which owns the edit accordion.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const PRODUCER_ID = 7;

/** Satisfies every producerCompleteness() requirement (lib/producer-completeness.js:53). */
const COMPLETE_PROFILE = {
  id: PRODUCER_ID,
  name: "מאפיית שקד",
  city: "חיפה",
  phone: "050-1234567",
  has_physical_location: true,
  offers_delivery: false,
  delivery_areas: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  images: [{ id: 1, url: "https://res.cloudinary.com/demo/image/upload/a.jpg" }],
  // opening_hours rides the PRIMARY location, not the producer, since MEH-2142
  // (lib/hours.js:177-183). Omitting it is what made the first version of this
  // fixture read `data-state-complete="false"` — caught by the precondition
  // below rather than by a confusing UI failure, which is the whole reason the
  // precondition is there.
  locations: [
    {
      id: 1,
      kind: "branch",
      is_primary: true,
      lat: 32.08,
      lng: 34.78,
      opening_hours: "א-ה 09:00-17:00",
    },
  ],
  short_description: "מאפייה שכונתית",
  products: [{ id: 1, name: "חלה" }],
  phone_verified: true,
};

/** Missing city, coords, contact, category and image — five requirements short. */
const INCOMPLETE_PROFILE = {
  ...COMPLETE_PROFILE,
  city: null,
  phone: null,
  categories: [],
  images: [],
  locations: [],
  short_description: null,
  description: null,
};

const NO_ACTIVITY = {
  profile_views: { total: 0, last_7d: 0 },
  whatsapp_clicks: { total: 0, last_7d: 0 },
  contact_clicks: { total: 0, last_7d: 0 },
  average_rating: null,
  total_reviews: 0,
  rank_in_city: null,
  conversion_rate: "0%",
  profile_strength: 10,
};

const WITH_ACTIVITY = {
  ...NO_ACTIVITY,
  profile_views: { total: 140, last_7d: 31 },
  whatsapp_clicks: { total: 12, last_7d: 4 },
  contact_clicks: { total: 9, last_7d: 2 },
  average_rating: 4.5,
  total_reviews: 8,
  conversion_rate: "9%",
  profile_strength: 90,
};

type SessionOpts = {
  role?: string;
  status?: string;
  profile?: Record<string, unknown> | null;
  analytics?: Record<string, unknown>;
  producerId?: number | null;
  topCities?: { city: string; count: number }[];
  followers?: number;
};

/**
 * Seeds a session and every read the shell + its tabs make.
 *
 * Route order matters: `**\/producers/me` is registered LAST because Playwright
 * gives the most recently added route priority on an overlap, and the glob is
 * anchored at both ends so it cannot swallow /producers/me/dashboard.
 */
async function stubSession(page: Page, opts: SessionOpts = {}): Promise<void> {
  const {
    role = "producer",
    status = "approved",
    profile = COMPLETE_PROFILE,
    analytics = WITH_ACTIVITY,
    producerId = PRODUCER_ID,
    topCities = [
      { city: "חיפה", count: 9 },
      { city: "תל אביב", count: 7 },
      { city: "ירושלים", count: 4 },
    ],
    followers = 5,
  } = opts;

  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
  });
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 42,
        email: "owner@example.com",
        name: "שקד",
        role,
        ...(producerId === null ? {} : { producer_id: producerId }),
      }),
    }),
  );
  await page.route("**/favorites**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/producers/me/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        producer: {
          id: PRODUCER_ID,
          name: "מאפיית שקד",
          slug: status === "approved" ? "maafiat-shaked" : null,
          status,
          availability_state: "accepting_orders",
          vacation_until: null,
        },
        stats: {},
      }),
    }),
  );
  await page.route("**/producers/me/analytics**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...analytics,
        top_cities: topCities,
        follower_count: followers,
        new_followers_this_week: 0,
      }),
    }),
  );
  await page.route("**/producers/me", (route) =>
    route.fulfill({
      status: profile ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(profile ? { ...profile, status } : { detail: "not found" }),
    }),
  );
}

const overview = (page: Page) => page.getByTestId("producer-overview");
const tabNav = (page: Page) => page.getByRole("navigation", { name: "ניווט בלוח הניהול" });

/**
 * The control every test runs before reading anything.
 *
 * A broken stub, a redirect to /login and a real regression all produce the
 * same empty screen, so every absence assertion below is void unless the
 * Overview's own root actually mounted.
 */
async function openOverview(page: Page): Promise<void> {
  await page.goto("/producer/dashboard");
  await expect(
    overview(page),
    "control: the Overview never rendered — every assertion in this test is void",
  ).toBeVisible({ timeout: 15_000 });
}

// ── MT:MEH-1599 + MT:MEH-964-1A:1 — the one UX gate ────────────────────────

test.describe("dashboard shell — access control", () => {
  // MT:MEH-1599:4 only — NOT row 5. This asserts the redirect PARAM; row 5 is
  // the post-login leg ("נוחתות על /producer/dashboard, לא על דף הבית"), and a
  // /login that ignored the param entirely would leave this test green while
  // row 5's outcome broke. That leg is already covered, by a REAL seeded login
  // in flows/25-role-reachability.spec.ts:196, so the row is re-pointed there
  // rather than claimed here.
  test("an unauthenticated visitor is sent to /login carrying the target back", async ({
    page,
  }) => {
    // No stub at all: no token, no /auth/me. This is the 401 branch.
    await page.goto("/producer/dashboard/edit");
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    const url = new URL(page.url());
    expect(
      url.searchParams.get("redirect"),
      "the redirect param must name the page she asked for, locale-stripped",
    ).toBe("/producer/dashboard/edit");
    await expect(page.getByTestId("access-denied")).toHaveCount(0);
  });

  // MT:MEH-1599:1 — and the row that MT:MEH-964-1A:1 gets wrong (drift D1).
  test("an authenticated consumer stays on the URL and is told why, in place", async ({
    page,
  }) => {
    await stubSession(page, { role: "consumer", producerId: null });
    await page.goto("/producer/dashboard");

    const denied = page.getByTestId("access-denied");
    await expect(
      denied,
      "control: the denied state never rendered — the assertions below are void",
    ).toBeVisible({ timeout: 15_000 });

    // The whole point of MEH-1599: no navigation happened.
    expect(new URL(page.url()).pathname).toMatch(/\/producer\/dashboard$/);
    await expect(denied).toContainText("אין לך גישה ללוח הבקרה");
    await expect(denied.getByRole("link", { name: "רשמו בית עסק" })).toBeVisible();
    await expect(denied.getByRole("link", { name: "חזרו לדף הבית" })).toBeVisible();
    // Exactly one denied state — the layout returns before children mount, so
    // the child pages' own duplicate role guards cannot also render one.
    await expect(denied).toHaveCount(1);
    await expect(overview(page)).toHaveCount(0);
  });

  // MT:MEH-1599:6
  test("a producer gets the dashboard with no denial anywhere", async ({ page }) => {
    await stubSession(page);
    await openOverview(page);
    await expect(page.getByTestId("access-denied")).toHaveCount(0);
  });
});

// ── MT:MEH-964-1A — the shell ──────────────────────────────────────────────

test.describe("dashboard shell — tab nav", () => {
  // MT:MEH-964-1A:2, MT:MEH-964-1B:5 (the fourth tab exists), MT:MEH-964-1A:6
  test("four tabs in the locked order, and exactly one is aria-current", async ({ page }) => {
    await stubSession(page);
    await openOverview(page);

    const tabs = tabNav(page).getByRole("link");
    // A COUNT, not a set of presence checks: a fifth tab, or a resurrected
    // "coming soon" placeholder, has to fail this.
    await expect(tabs).toHaveCount(5); // 4 tabs + the "צפייה בדף" link
    await expect(
      tabNav(page).getByRole("link", { name: /סקירה|עריכה|תובנות|כלים/ }),
    ).toHaveCount(4);

    for (const [i, label] of ["סקירה", "עריכה", "תובנות", "כלים"].entries()) {
      await expect(tabs.nth(i), `tab ${i} must be «${label}»`).toContainText(label);
    }

    // Exactly one, and it is the index route we are on.
    const current = tabNav(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("סקירה");
  });

  // MT:MEH-964-1A:2 (the active tab follows the route)
  test("the active tab follows the route, and the index does not light up its children", async ({
    page,
  }) => {
    await stubSession(page);
    await openOverview(page);

    await tabNav(page).getByRole("link", { name: "כלים" }).click();
    await page.waitForURL(/\/producer\/dashboard\/tools/, { timeout: 15_000 });

    const current = tabNav(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("כלים");
    // `exact: true` on the index tab is what stops /tools lighting סקירה too.
    await expect(tabNav(page).getByRole("link", { name: "סקירה" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  // MT:MEH-964-1A:8, MT:MEH-964-1B:8 — the tab half of both /en rows.
  test("/en renders English tab labels, with no raw message keys", async ({ page }) => {
    await stubSession(page);
    await page.goto("/en/producer/dashboard");
    // Located structurally, not by its aria-label: the label is itself
    // localized ("Dashboard navigation" on /en, "ניווט בלוח הניהול" on /he),
    // so gating on the Hebrew one would fail for the right reason and gating
    // on a guessed English one fails for the wrong one — which is what the
    // first version of this test did.
    const nav = page.locator('nav:has(a[href$="/producer/dashboard/tools"])');
    await expect(
      nav,
      "control: the shell never rendered on /en — the assertions below are void",
    ).toBeVisible({ timeout: 15_000 });
    for (const [i, label] of ["Overview", "Edit", "Insights", "Tools"].entries()) {
      await expect(nav.getByRole("link").nth(i), `tab ${i} must read «${label}»`).toContainText(
        label,
      );
    }
    // A missing key renders as the dotted path itself, which is the failure
    // this row exists to catch — and it is invisible to a presence-only check.
    await expect(nav).not.toContainText("dashboard.producer.nav");
  });

  // NOT a coverage marker for MEH-964-1A row 5: that row is about the tools
  // grid AND this link, and only the link half is asserted here. The row is
  // left unconverted in the checklist and reported below.
  test("the view-page link targets the UUID route, and vanishes without a producer_id", async ({
    page,
  }) => {
    await stubSession(page);
    await openOverview(page);
    // The UUID route, NOT /p/{slug}: the owner-exception lets her see her own
    // page while pending, where the slug route is approved-only and 404s.
    await expect(tabNav(page).getByRole("link", { name: "צפייה בדף" })).toHaveAttribute(
      "href",
      new RegExp(`/producer/${PRODUCER_ID}$`),
    );

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubSession(page, { producerId: null });
    await openOverview(page);
    await expect(tabNav(page).getByRole("link", { name: "צפייה בדף" })).toHaveCount(0);
  });
});

// ── MT:MEH-964-1B — the KPI strip ──────────────────────────────────────────

test.describe("dashboard shell — KPI strip", () => {
  // MT:MEH-964-1B:1, :2 — NOT :3. Row 3 is the conversion LINE, whose copy has
  // been rewritten (drift D4) and which this test only checks the absence of
  // inside the strip; asserting the row would be a coverage claim this file
  // does not earn.
  test("four KPIs in the locked DOM order, one uniform window label, no deltas", async ({
    page,
  }) => {
    await stubSession(page, { analytics: WITH_ACTIVITY });
    await openOverview(page);
    await expect(
      overview(page),
      "fixture precondition: this test needs the has-activity branch",
    ).toHaveAttribute("data-state-active", "true");

    const strip = page.getByTestId("overview-kpi-strip");
    await expect(strip).toBeVisible();
    const cards = strip.locator("> div");
    await expect(cards).toHaveCount(4);

    // DOM order IS the locked RTL order (page.js:983): the dir=rtl 2-col grid
    // lays kpis[0] out top-right. Asserting the order, not just membership.
    for (const [i, label] of [
      "קליקים בוואטסאפ",
      "קליקים ליצירת קשר (בלי וואטסאפ)",
      "דירוג",
      "צפיות",
    ].entries()) {
      await expect(cards.nth(i), `KPI ${i} must be «${label}»`).toContainText(label);
    }

    // Uniform window label on the three counters; rating carries its own sub.
    await expect(strip.getByText("7 הימים האחרונים")).toHaveCount(3);
    await expect(cards.nth(2)).toContainText("8 ביקורות");

    // No trend arrows/deltas anywhere in the strip — the AC's "labeled deltas"
    // was superseded by data reality (the payload has no prior-period counts).
    await expect(strip.locator("svg")).toHaveCount(0);
    await expect(strip).not.toContainText("%");
  });

  // Drift D5 — the state the doc does not name.
  test("with no activity at all the strip is replaced, not zero-filled", async ({ page }) => {
    await stubSession(page, { analytics: NO_ACTIVITY });
    await openOverview(page);
    await expect(
      overview(page),
      "fixture precondition: this test needs the no-activity branch",
    ).toHaveAttribute("data-state-active", "false");

    await expect(page.getByTestId("overview-zero-state")).toBeVisible();
    await expect(page.getByTestId("overview-kpi-strip")).toHaveCount(0);
  });

  // MT:MEH-964-1B:6 — FLAG-1, the anti-MEH-961/963 rule.
  test("the strip renders on Overview and NOWHERE else", async ({ page }) => {
    await stubSession(page, { analytics: WITH_ACTIVITY });
    await openOverview(page);
    await expect(page.getByTestId("overview-kpi-strip")).toHaveCount(1);

    await tabNav(page).getByRole("link", { name: "תובנות" }).click();
    await page.waitForURL(/\/producer\/dashboard\/insights/, { timeout: 15_000 });
    // Control: insights must actually have rendered, or the absence is free.
    // The heading, not a list testid — see openInsights() below for why.
    await expect(
      page.getByRole("heading", { name: "ערים מובילות" }),
      "control: the insights tab never rendered — the absence below is void",
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("overview-kpi-strip")).toHaveCount(0);
  });
});

// ── MT:MEH-1134 — state-conditional card order ─────────────────────────────

test.describe("dashboard shell — card order", () => {
  // MT:MEH-1134:1, :4
  test("pending: the completeness card sits above the disabled availability card", async ({
    page,
  }) => {
    await stubSession(page, { status: "pending", profile: INCOMPLETE_PROFILE });
    await openOverview(page);
    await expect(
      overview(page),
      "fixture precondition: this test needs a NOT-approved business",
    ).toHaveAttribute("data-state-approved", "false");

    const completeness = page.getByTestId("profile-completeness-card");
    const hint = page.getByTestId("availability-disabled-hint");
    await expect(completeness).toBeVisible();
    await expect(hint, "pending keeps the availability pills disabled with a reason").toBeVisible();

    // Order by RENDERED position, not by document position. The row is about
    // what the owner sees ("מעל כרטיס הזמינות"), and the two can diverge —
    // `order`, grid placement or absolute positioning all move a box without
    // moving the node. `y` is top-to-bottom whatever the writing direction, so
    // "above" stays unambiguous on this dir=rtl page.
    const cardBox = await completeness.boundingBox();
    const hintBox = await hint.boundingBox();
    expect(cardBox, "the completeness card has no box — it is not rendered").not.toBeNull();
    expect(hintBox, "the availability hint has no box — it is not rendered").not.toBeNull();
    expect(
      cardBox!.y,
      "the actionable card must render ABOVE the disabled availability card",
    ).toBeLessThan(hintBox!.y);
  });

  // MT:MEH-1134:2, MT:MEH-1134:3 — drift D3: row 2 describes a slot MEH-1397
  // deleted, which also makes row 3 ("exactly one instance") trivially true.
  test("approved + complete: the completeness card does not render at all", async ({ page }) => {
    await stubSession(page, { status: "approved", profile: COMPLETE_PROFILE });
    await openOverview(page);
    await expect(
      overview(page),
      "fixture precondition: this test needs approved AND complete",
    ).toHaveAttribute("data-state-approved", "true");
    await expect(overview(page)).toHaveAttribute("data-state-complete", "true");

    // MEH-1397 reversed MEH-288's "never fully disappears": once approved and
    // complete, the collapsed "הפרופיל מלא ✓" card is noise with no action.
    await expect(page.getByTestId("profile-completeness-card")).toHaveCount(0);
    await expect(page.getByTestId("availability-disabled-hint")).toHaveCount(0);
  });
});

// ── MT:MEH-1101 — insights zero-state and low-n lists ──────────────────────

test.describe("dashboard shell — insights", () => {
  /**
   * The control gates on the "ערים מובילות" HEADING, not on a list testid.
   *
   * `top-cities-list` exists only on the <3-cities branch (insights/page.js:431)
   * — the 3+ branch renders an untagged <ul> of bars. A control that consults a
   * branch-specific element cannot tell "the page never rendered" from "a
   * different branch rendered", which is the same defect class this file's own
   * assertions are written to avoid. The heading is emitted by every branch,
   * the empty one included.
   */
  async function openInsights(page: Page): Promise<void> {
    await page.goto("/producer/dashboard/insights");
    await expect(
      page.getByRole("heading", { name: "ערים מובילות" }),
      "control: the insights tab never rendered — every assertion here is void",
    ).toBeVisible({ timeout: 15_000 });
  }

  // MT:MEH-1101:1
  test("before approval a banner explains the zeros and routes to the edit tab", async ({
    page,
  }) => {
    await stubSession(page, { status: "pending", profile: INCOMPLETE_PROFILE });
    await openInsights(page);

    const zero = page.getByTestId("insights-zero-state");
    await expect(zero).toBeVisible();
    await expect(zero.getByRole("link")).toHaveAttribute(
      "href",
      /\/producer\/dashboard\/edit$/,
    );
  });

  // MT:MEH-1101:2
  test("after approval the banner is gone", async ({ page }) => {
    await stubSession(page, { status: "approved" });
    await openInsights(page);
    await expect(page.getByTestId("insights-zero-state")).toHaveCount(0);
  });

  // MT:MEH-1101:3 — the low-n substitution, asserted as a partition.
  test("top cities: bars at 3+, a plain list at 1-2", async ({ page }) => {
    await stubSession(page, {
      topCities: [
        { city: "חיפה", count: 9 },
        { city: "תל אביב", count: 7 },
        { city: "ירושלים", count: 4 },
      ],
    });
    await openInsights(page);
    await expect(page.getByTestId("city-bar")).toHaveCount(3);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubSession(page, { topCities: [{ city: "חיפה", count: 2 }] });
    await openInsights(page);
    // Same list, no bars — the substitution is what the row is about.
    await expect(page.getByTestId("top-cities-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("city-bar")).toHaveCount(0);
  });

  // MT:MEH-1101:4
  test("zero followers gets an invitation instead of «0 · +0»", async ({ page }) => {
    await stubSession(page, { followers: 0 });
    await openInsights(page);
    await expect(page.getByTestId("followers-zero-cta")).toBeVisible();
  });
});

// ── MT:MEH-1102 — the tools tab ────────────────────────────────────────────

test.describe("dashboard shell — tools tab", () => {
  async function openTools(page: Page) {
    await page.goto("/producer/dashboard/tools");
    const grid = page.getByTestId("tools-grid");
    // Gate on the GRID being ATTACHED — not on a link inside it, and not on the
    // grid being VISIBLE. All three were measured against a build whose grid
    // renders with zero links:
    //
    //   grid.getByRole("link").first() -> toBeVisible   FAILS "never rendered"
    //   grid                           -> toBeVisible   FAILS "never rendered"
    //   grid                           -> toBeAttached  PASSES, count then fails 5 vs 0
    //
    // Only the third distinguishes "the grid never mounted" from "the grid
    // mounted with nothing in it". The second is the OBVIOUS fix and it does not
    // work: `toBeVisible` requires a non-empty bounding box, so an empty
    // container reports `hidden` and the control misdiagnoses it exactly as the
    // link-based form did. Attachment answers mounting and nothing else, which
    // is what a control is for; the link COUNT is then a separate assertion
    // carrying its own message rather than being smuggled into the control.
    await expect(
      grid,
      "control: the tools grid never rendered — every assertion here is void",
    ).toBeAttached({ timeout: 15_000 });
    return grid;
  }

  // MT:MEH-1102:1, MT:MEH-1102:3 — drift D2: the doc says four, and names one
  // that is gone. Row 3 ("targets unchanged") is the href loop below.
  test("the grid holds exactly five cards, and the two removed ones are absent", async ({
    page,
  }) => {
    await stubSession(page);
    const grid = await openTools(page);

    // A COUNT at the MEASURED value. The doc says 4; adding or losing a card
    // must fail this either way.
    await expect(grid.getByRole("link")).toHaveCount(5);

    for (const href of [
      "/producer/dashboard/events",
      "/producer/dashboard/experiences",
      "/producer/dashboard/group-buys",
      "/producer/dashboard/recipes",
      `/producer/${PRODUCER_ID}#reviews`,
    ]) {
      await expect(
        grid.locator(`a[href$="${href}"]`),
        `the tools grid must still route to ${href}`,
      ).toHaveCount(1);
    }

    // MEH-1102 removed the עריכת-פרופיל card (duplicate of the עריכה tab) and
    // MEH-1357 the הצגת-העסק one (duplicate of the shell's צפייה בדף link).
    await expect(grid.locator('a[href$="/producer/dashboard/edit"]')).toHaveCount(0);
    await expect(grid.locator(`a[href$="/producer/${PRODUCER_ID}"]`)).toHaveCount(0);
  });

  // MT:MEH-1102:2
  test("every card carries an icon above its title", async ({ page }) => {
    await stubSession(page);
    const grid = await openTools(page);
    const cards = grid.getByRole("link");
    const count = await cards.count();
    expect(count).toBe(5);
    for (let i = 0; i < count; i += 1) {
      await expect(cards.nth(i).locator("svg"), `card ${i} has no icon`).toHaveCount(1);
    }
  });
});
