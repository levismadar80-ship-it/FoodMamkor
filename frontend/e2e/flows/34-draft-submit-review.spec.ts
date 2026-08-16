import { test, expect, type Page } from "./_cloudinary-stub";

/**
 * Spec:     34-draft-submit-review
 * Purpose:  MEH-2100 — the draft→submit-for-review state machine, end to end in
 *           a real browser. Pins the four things the batch actually changed:
 *             A — a `draft` business gets the COMPLETION banner and never the
 *                 "הפרופיל שלך בסקירה" review banner, with the missing items
 *                 named, the CTA disabled and the OTP card mounted in place.
 *             B — completing the requirements enables the CTA; confirming POSTs
 *                 to /producers/me/submit-for-review exactly once and the
 *                 review banner takes over with no reload.
 *             C — a 422 from the server re-writes the missing list from
 *                 `detail.params.missing`, overriding what the client computed.
 *             D — a `pending` business gets the review banner and no draft
 *                 banner: the two are keyed on the same field and can never
 *                 co-render.
 * Touches:  no backend. GET /auth/me, /favorites, /producers/me{,/dashboard,
 *           /analytics} and POST /producers/me/submit-for-review are all
 *           route-mocked and the session token is seeded via addInitScript, so
 *           this runs on the DEFAULT CI E2E target (localhost:3000, no
 *           storageState fixtures) — unlike flows/25, which needs DEMO_*.
 * Does NOT: cover the WhatsApp OTP itself. Verifying a real number needs a code
 *           delivered out of band; the card's PRESENCE inside the draft banner
 *           is asserted here (A), and its behaviour is covered at the vitest
 *           layer in __tests__/DraftSubmitBanner.test.jsx. Does not touch
 *           27-register-draft-banner, which is a different "draft": the
 *           wizard's localStorage resume prompt (MEH-1769), not the server-side
 *           `status` value this spec is about.
 * Related:  components/producer/DraftSubmitBanner.jsx, lib/submission-gate.js,
 *           app/[locale]/producer/dashboard/page.js (the status switch),
 *           backend/app/routers/producer_me.py submit_for_review.
 * History:  MEH-2100 PR4 (creation).
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
 * // MEH-1619 — MEASURED, not asserted. Each of the four was run against two
 * deliberately broken production builds as well as the shipped one, because a
 * test that has never been observed failing is a green light of unknown wiring:
 *
 *   build                                        A    B    C    D
 *   shipped (staging @ b9865e38)                 ok   ok   ok   ok
 *   pre-MEH-2100: the draft branch removed       RED  RED  RED  ok
 *   co-render bug: status !== "approved"         ok   RED  ok   RED
 *
 * Every test is red in at least one construction, and in each run ONLY the
 * tests that should have failed did — which is the part that makes it evidence
 * rather than noise. D is green in the pre-batch column on purpose: the review
 * banner predates this batch, so what D actually guards is the co-render, and
 * that is the column it is red in. Nothing here gates on
 * `count() === 0 → skip`, the ready/not-ready states are read from counts and
 * data-attributes rather than "something is on screen", and openOverview() is a
 * control: every absence assertion is void if the page never rendered.
 */

const SUBMIT_URL = "**/producers/me/submit-for-review";

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

/** The same profile with all five requirements satisfied. */
const COMPLETE = {
  ...INCOMPLETE,
  images: [{ id: 1, url: "https://res.cloudinary.com/demo/image/upload/a.jpg" }],
  products: [{ id: 1, name: "חלה" }],
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78 }],
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

const draftBanner = (page: Page) => page.getByTestId("draft-submit-banner");
const reviewBanner = (page: Page) => page.getByTestId("status-pending-banner");

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

    await expect(draftBanner(page)).toBeVisible();
    // The replacement, asserted from the other side: a business that has not
    // asked to be reviewed must not be told it is being reviewed.
    await expect(reviewBanner(page)).toHaveCount(0);

    // Exactly five, not "at least one" — a count is falsifiable by a rule
    // silently dropping out of the gate; a presence check is not.
    await expect(page.getByTestId("draft-missing-list").getByRole("listitem")).toHaveCount(5);
    for (const code of ["image", "product", "category", "location", "phone_verified"]) {
      await expect(page.getByTestId(`draft-missing-${code}`)).toBeVisible();
    }

    await expect(draftBanner(page)).toHaveAttribute("data-state-ready", "false");
    await expect(page.getByTestId("draft-submit-cta")).toBeDisabled();

    // MEH-2100 Phase 0's finding: without this mount phone_verified can never
    // flip for a draft, and the gate is impassable for every new business.
    await expect(page.getByTestId("draft-phone-verify")).toBeVisible();
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
    await expect(draftBanner(page)).toHaveAttribute("data-state-ready", "true");
    // Nothing is missing, so the list must not render at all.
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
            message: "חסרים פריטי חובה",
            params: { missing: ["product"] },
          },
        }),
      });
    });

    await openOverview(page);
    await expect(page.getByTestId("draft-missing-list")).toHaveCount(0);
    await page.getByTestId("draft-submit-cta").click();
    await page.getByTestId("draft-submit-confirm-yes").click();

    // Exactly the server's one code — the client's (empty) computation is
    // discarded, and the status has NOT moved.
    await expect(page.getByTestId("draft-missing-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("draft-missing-product")).toBeVisible();
    await expect(draftBanner(page)).toBeVisible();
    await expect(reviewBanner(page)).toHaveCount(0);
  });

  test("D — a pending business gets the review banner and no draft banner", async ({ page }) => {
    const profileRef = { current: COMPLETE };
    const statusRef = { current: "pending" };
    await stubDashboard(page, profileRef, statusRef);
    await openOverview(page);

    await expect(reviewBanner(page)).toBeVisible();
    await expect(draftBanner(page)).toHaveCount(0);
  });
});
