import { test, expect, type Page } from "./_cloudinary-stub";

/**
 * Spec:     34-draft-submit-review
 * Purpose:  MEH-2100 — the draft→submit-for-review state machine, end to end in
 *           a real browser. Pins the four things the batch actually changed:
 *             A — a `draft` business gets the COMPLETION surface and never the
 *                 "הפרופיל שלך בסקירה" review banner, with the missing items
 *                 named, the CTA disabled and the OTP card mounted in place.
 *             B — completing the requirements enables the CTA; confirming POSTs
 *                 to /producers/me/submit-for-review exactly once and the
 *                 review banner takes over with no reload.
 *             C — a 422 from the server overrides what the client computed:
 *                 the server's sentence is shown and the CTA goes back to
 *                 disabled. For an organizer (C-org), whose draft banner still
 *                 carries the list, the list is re-written from
 *                 `detail.params.missing`.
 *             D — a `pending` business gets the review banner and no draft
 *                 surface: the two are keyed on the same field and can never
 *                 co-render.
 *
 *           MEH-2883 (#4270) moved a BUSINESS onto one checklist: the
 *           completeness card (`profile-completeness-card`) names the missing
 *           items as its rows, and the submit actions sit at its foot as
 *           DraftSubmitBanner variant="actions" (`draft-submit-actions` — no
 *           title, no body, no `draft-missing-list`). The standalone banner
 *           (`draft-submit-banner`, with the list) is the ORGANIZER's surface
 *           only. A–D read the business structure; C-org reads the banner.
 * Touches:  no backend. GET /auth/me, /favorites, /producers/me{,/dashboard,
 *           /analytics} and POST /producers/me/submit-for-review are all
 *           route-mocked and the session token is seeded via addInitScript, so
 *           this runs on the DEFAULT CI E2E target (localhost:3000, no
 *           storageState fixtures) — unlike flows/25, which needs DEMO_*.
 * Does NOT: cover the WhatsApp OTP itself. Verifying a real number needs a code
 *           delivered out of band; the card's PRESENCE inside the completeness
 *           card is asserted here (A), and its behaviour is covered at the vitest
 *           layer in __tests__/DraftSubmitBanner.test.jsx. Does not touch
 *           27-register-draft-banner, which is a different "draft": the
 *           wizard's localStorage resume prompt (MEH-1769), not the server-side
 *           `status` value this spec is about.
 * Related:  components/producer/DraftSubmitBanner.jsx, components/ProfileCompletenessCard.jsx,
 *           lib/submission-gate.js, app/[locale]/producer/dashboard/page.js
 *           (the status switch), backend/app/routers/producer_me.py
 *           submit_for_review, __tests__/DashboardOrderOneChecklist.test.jsx.
 * History:  MEH-2100 PR4 (creation). MEH-2883 chunk 2 (re-pointed at the
 *           one-checklist structure of #4270; C-org added so the server-list
 *           behaviour keeps an E2E row where it still exists).
 *
 * ON MOCKING INSIDE flows/ — the three conditions in frontend/e2e/CLAUDE.md
 * (MEH-1968), stated rather than assumed:
 *   1. No assertion here is about backend BEHAVIOUR. Every one is about which
 *      surface the dashboard renders for a given `status` + profile, and what
 *      it does with a fixed response. The server-side gate is proven where it
 *      lives, in backend/tests (submission_gate + submit_for_review).
 *   2. The mocked contracts are pinned elsewhere: the 422 body is the MEH-1943
 *      {code, message, params} shape, and its `missing` codes are asserted
 *      equal to the backend's list by __tests__/SubmissionGateParity.test.js.
 *   3. The unmocked alternative burns a shared resource — reaching `draft`
 *      honestly means POST /auth/register/producer on shared runner IPs, whose
 *      rate limiter is already a documented CI constraint, and then an OTP
 *      that cannot be received in CI at all.
 *
 * // MEH-1619 — MEASURED, not asserted. The original table (MEH-2100 PR4) ran
 * each test against two deliberately broken builds; every test was red in at
 * least one and only the ones that should have failed did. MEH-2883 chunk 2
 * re-measured the re-pointed assertions against the shipped build with each
 * NEW locator swapped back to the pre-#4270 one (the PR body has the runs):
 * every changed assertion goes red on the old structure, so none of them is
 * green by being unable to find anything. D now asserts the absence of BOTH
 * draft surfaces — before, on #4270's structure, its `draft-submit-banner`
 * absence was true of every business and could not fail. Nothing here gates on
 * `count() === 0 → skip`, the ready/not-ready states are read from counts and
 * data-attributes rather than "something is on screen", and openOverview() is
 * a control: every absence assertion is void if the page never rendered.
 */

const SUBMIT_URL = "**/producers/me/submit-for-review";

/** The 422's own sentence (MEH-1943 `message`), rendered by the error toast. */
const SERVER_422_MESSAGE = "חסרים פריטי חובה — השרת לא מצא מוצר בקטלוג";

/** A profile that fails every submission requirement. */
const INCOMPLETE = {
  id: 7,
  name: "מאפיית שקד",
  status: "draft",
  images: [],
  products: [],
  categories: [],
  locations: [],
  lat: null,
  lng: null,
  has_physical_location: true,
  offers_delivery: false,
  delivery_areas: [],
  phone_verified: false,
};

/**
 * The same profile with all five requirements satisfied. `city` and `phone`
 * are what a real registration carries; with them the completeness card agrees
 * with the gate on every REQUIRED row (its location row also wants a city, and
 * its contact row a phone or Instagram), so "nothing required is missing" is a
 * statement both surfaces make. Opening hours stay unset: that row is the one
 * «מומלץ» step and does not block submission.
 */
const COMPLETE = {
  ...INCOMPLETE,
  city: "חיפה",
  phone: "050-1234567",
  images: [{ id: 1, url: "https://res.cloudinary.com/demo/image/upload/a.jpg" }],
  products: [{ id: 1, name: "חלה" }],
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78 }],
  phone_verified: true,
};

/** An organizer (ADR-036) with its four requirements satisfied. */
const ORGANIZER_COMPLETE = {
  id: 7,
  name: "שוק האיכרים בנמל",
  kind: "organizer",
  status: "draft",
  images: [{ id: 1, url: "https://res.cloudinary.com/demo/image/upload/a.jpg" }],
  description: "שוק איכרים שבועי בנמל, כל יום שישי בבוקר",
  upcoming_events_count: 1,
  phone_verified: true,
};

/**
 * Seeds a producer session and every read the Overview makes.
 *
 * `profileRef` / `statusRef` are read at request time rather than captured, so
 * a test can flip what the server reports mid-flight — which is how the real
 * page behaves after a submit or a phone verification.
 */
async function stubDashboard(
  page: Page,
  profileRef: { current: Record<string, unknown> },
  statusRef: { current: string },
) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
  });
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 7,
        email: "seller@mehamakor.online",
        name: "שקד",
        role: "producer",
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
          id: 7,
          name: "מאפיית שקד",
          slug: null,
          status: statusRef.current,
          availability_state: "available",
          vacation_until: null,
        },
        stats: {},
      }),
    }),
  );
  await page.route("**/producers/me/analytics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ profile_views: { total: 0 }, whatsapp_clicks: { total: 0 } }),
    }),
  );
  // Anchored at both ends by Playwright's glob matcher, so it matches
  // /producers/me and NOT /producers/me/dashboard — the sub-paths above keep
  // their own handlers. Registered last regardless, since the most recently
  // added route wins any overlap.
  await page.route("**/producers/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...profileRef.current, status: statusRef.current }),
    }),
  );
}

/** A business's one checklist (MEH-2883): the completeness card. */
const card = (page: Page) => page.getByTestId("profile-completeness-card");
/** The submit actions at the card's foot — the business's draft surface. */
const draftActions = (page: Page) => card(page).getByTestId("draft-submit-actions");
/** The standalone banner with its own list — an organizer's draft surface only. */
const draftBanner = (page: Page) => page.getByTestId("draft-submit-banner");
const reviewBanner = (page: Page) => page.getByTestId("status-pending-banner");
/** One checklist row, found by the chip it always renders (done or not). */
const cardRow = (page: Page, key: string) =>
  card(page).getByRole("listitem").filter({ has: page.getByTestId(`completeness-chip-${key}`) });
/** Rows whose screen-reader status reads «עדיין חסר» (checklist_todo). */
const missingRows = (page: Page) => card(page).getByRole("listitem").filter({ hasText: "עדיין חסר" });

/** The five rows the submit gate blocks on, in the card's terms: the gate's
 *  `category` + `location` codes are the one «קטגוריות ומיקום» row, and the
 *  card also marks contact as חובה. Hours is the one «מומלץ» row. */
const REQUIRED_ROWS = ["image", "location", "products", "contact", "phone_verified"];

/**
 * The control. Every "X is absent" assertion below is worthless if the page
 * never rendered — a broken mock, a redirect to /login and a real regression
 * all produce the same empty screen. Gate on the Overview's own root, which is
 * present in every status.
 */
async function openOverview(page: Page) {
  await page.goto("/producer/dashboard");
  await expect(
    page.getByTestId("producer-overview"),
    "the Overview never rendered — every absence assertion in this test is void",
  ).toBeVisible({ timeout: 15_000 });
}

test.describe("MEH-2100 — draft → submit for review", () => {
  test("A — a draft names what is missing, disables the CTA and mounts the OTP card", async ({
    page,
  }) => {
    const profileRef = { current: INCOMPLETE };
    const statusRef = { current: "draft" };
    await stubDashboard(page, profileRef, statusRef);
    await openOverview(page);

    await expect(draftActions(page)).toBeVisible();
    // The replacement, asserted from the other side: a business that has not
    // asked to be reviewed must not be told it is being reviewed.
    await expect(reviewBanner(page)).toHaveCount(0);
    // One checklist, not two (MEH-2883): no second banner with its own list.
    await expect(draftBanner(page)).toHaveCount(0);
    await expect(page.getByTestId("draft-missing-list")).toHaveCount(0);

    // Exactly six rows reading «עדיין חסר», not "at least one" — a count is
    // falsifiable by a rule silently dropping out; a presence check is not.
    // Every required row is among them, each still carrying its «חובה» chip.
    await expect(card(page).getByRole("listitem")).toHaveCount(6);
    await expect(missingRows(page)).toHaveCount(6);
    for (const key of REQUIRED_ROWS) {
      await expect(cardRow(page, key)).toContainText("עדיין חסר");
      await expect(page.getByTestId(`completeness-chip-${key}`)).toHaveText("חובה");
    }

    await expect(draftActions(page)).toHaveAttribute("data-state-ready", "false");
    await expect(page.getByTestId("draft-submit-cta")).toBeDisabled();

    // MEH-2100 Phase 0's finding: without this mount phone_verified can never
    // flip for a draft, and the gate is impassable for every new business.
    // It now lives inside the one card, beside the action it unblocks.
    await expect(card(page).getByTestId("draft-phone-verify")).toBeVisible();
  });

  test("B — completing the requirements sends it once, and the review banner takes over", async ({
    page,
  }) => {
    const profileRef = { current: COMPLETE };
    const statusRef = { current: "draft" };
    await stubDashboard(page, profileRef, statusRef);

    let submitCalls = 0;
    await page.route(SUBMIT_URL, (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitCalls += 1;
      // What the server does on success — the row moves to pending. The page
      // must not need a reload to reflect it.
      statusRef.current = "pending";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "pending" }),
      });
    });

    await openOverview(page);
    await expect(draftActions(page)).toHaveAttribute("data-state-ready", "true");
    // Nothing REQUIRED is missing: every required row reads done, and the one
    // row still open is the «מומלץ» hours step, which does not block.
    for (const key of REQUIRED_ROWS) {
      await expect(cardRow(page, key)).toContainText("הושלם");
    }
    await expect(missingRows(page)).toHaveCount(1);
    await expect(cardRow(page, "hours")).toContainText("עדיין חסר");
    await expect(page.getByTestId("draft-missing-list")).toHaveCount(0);

    const cta = page.getByTestId("draft-submit-cta");
    await expect(cta).toBeEnabled();
    await cta.click();

    // One-way action: it asks before it fires. If this step ever disappears the
    // assertion below turns red rather than silently skipping a confirmation.
    await expect(page.getByTestId("draft-submit-confirm")).toBeVisible();
    const posted = page.waitForResponse(
      (r) => r.url().includes("/producers/me/submit-for-review") && r.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByTestId("draft-submit-confirm-yes").click();
    await posted;

    // Not "the actions are gone" alone: the card itself must still be on screen
    // (a pending business keeps its checklist), or the absence below proves
    // nothing about the swap.
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId("draft-submit-actions")).toHaveCount(0);
    await expect(draftBanner(page)).toHaveCount(0);
    await expect(reviewBanner(page)).toBeVisible();
    // Submission is not idempotent for the owner (there is no un-submit), so
    // "the banner changed" is not enough — the request must have gone out
    // exactly once.
    expect(submitCalls, "submit must fire exactly once per confirmation").toBe(1);
  });

  test("C — a 422 shows what the SERVER objected to, not what the client computed", async ({
    page,
  }) => {
    // The client sees a complete profile and enables the CTA. The server
    // disagrees — a product deleted in another tab, a stale read, anything.
    // Whose answer wins is the whole point of this test.
    const profileRef = { current: COMPLETE };
    const statusRef = { current: "draft" };
    await stubDashboard(page, profileRef, statusRef);

    await page.route(SUBMIT_URL, (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "submission_incomplete",
            // A sentence the client cannot produce itself, so seeing it on
            // screen proves the SERVER's reason reached the owner.
            message: SERVER_422_MESSAGE,
            params: { missing: ["product"] },
          },
        }),
      });
    });

    await openOverview(page);
    // The client's own verdict, before the server answers: ready.
    await expect(draftActions(page)).toHaveAttribute("data-state-ready", "true");
    await page.getByTestId("draft-submit-cta").click();
    await page.getByTestId("draft-submit-confirm-yes").click();

    // The server's answer wins: its sentence is shown, the client's "ready" is
    // discarded (the actions read not-ready and the CTA is disabled again),
    // and the status has NOT moved.
    await expect(page.getByText(SERVER_422_MESSAGE, { exact: true })).toBeVisible();
    await expect(draftActions(page)).toHaveAttribute("data-state-ready", "false");
    await expect(page.getByTestId("draft-submit-cta")).toBeDisabled();
    await expect(reviewBanner(page)).toHaveCount(0);
    // MEH-2883 by design: a business has no draft list any more, so the
    // server's codes are not rendered as rows — the card's rows still read
    // from the profile. (Reported on the PR: after a 422 the required rows can
    // all read done while the CTA is disabled.) The list behaviour lives on
    // where the list does — the organizer banner, C-org below.
    await expect(page.getByTestId("draft-missing-list")).toHaveCount(0);
  });

  test("C-org — an organizer's draft banner re-writes its list from the server's 422", async ({
    page,
  }) => {
    const profileRef = { current: ORGANIZER_COMPLETE };
    const statusRef = { current: "draft" };
    await stubDashboard(page, profileRef, statusRef);

    await page.route(SUBMIT_URL, (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "submission_incomplete",
            message: SERVER_422_MESSAGE,
            params: { missing: ["upcoming_event"] },
          },
        }),
      });
    });

    await openOverview(page);
    // ADR-036: an organizer keeps the standalone banner and gets no
    // completeness card — the inverse of the business path above.
    await expect(draftBanner(page)).toHaveAttribute("data-state-ready", "true");
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByTestId("draft-missing-list")).toHaveCount(0);
    await draftBanner(page).getByTestId("draft-submit-cta").click();
    await page.getByTestId("draft-submit-confirm-yes").click();

    // Exactly the server's one code — the client's (empty) computation is
    // discarded, and the status has NOT moved.
    await expect(page.getByTestId("draft-missing-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("draft-missing-upcoming_event")).toBeVisible();
    await expect(draftBanner(page)).toHaveAttribute("data-state-ready", "false");
    await expect(reviewBanner(page)).toHaveCount(0);
  });

  test("D — a pending business gets the review banner and no draft banner", async ({ page }) => {
    const profileRef = { current: COMPLETE };
    const statusRef = { current: "pending" };
    await stubDashboard(page, profileRef, statusRef);
    await openOverview(page);

    await expect(reviewBanner(page)).toBeVisible();
    // Both draft surfaces, and the card they would sit in as the positive
    // anchor: since MEH-2883 a business never gets `draft-submit-banner`, so
    // asserting only that one would be green for every status.
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId("draft-submit-actions")).toHaveCount(0);
    await expect(draftBanner(page)).toHaveCount(0);
  });
});
