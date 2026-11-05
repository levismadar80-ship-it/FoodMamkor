import { test, expect, type Page, type Route } from "./_cloudinary-stub";

/**
 * Spec:     38-register-delivery-axis
 * Purpose:  MEH-2107, re-cut by MEH-2668 onto MEH-2640's single question.
 *           #3960 replaced the two delivery checkboxes, the nationwide toggle
 *           and the city picker on DETAILS with ONE required radio —
 *           «איך קונים אצלכם?» (onsite / delivery / both). This spec drives
 *           that radio and asserts what reaches the POST body.
 * Touches:  /register/producer, rendered. GET /categories, GET /api/cities and
 *           POST /auth/register/producer are route-mocked (captured, never
 *           reached) — same rationale as flows/18 (MEH-1502: no real
 *           businesses on a shared target).
 * Does NOT: assert delivery areas — they moved to the dashboard
 *           (EditTabDeliveryCard.test.jsx owns them), nor Hebrew copy: every
 *           locator is a data-testid.
 * History:  MEH-2107 (creation) · MEH-2668 (re-cut after #3960).
 *
 * ── STATES ──────────────────────────────────────────────────────────────────
 *   radio : none selected (default) / one of three selected
 *   error : hidden (default) / shown (advance with nothing selected) / cleared
 *   body  : each option maps to its own (has_physical_location, offers_delivery)
 */

const REGISTER_POST = "**/auth/register/producer";

/** Mocks every backend call the wizard makes on this path. */
async function mockBackend(page: Page, capture: { body: unknown }): Promise<void> {
  await page.route("**/categories", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // MEH-2139: the popular grid keys by `slug`; a slug-less stub renders no chip.
      body: JSON.stringify([{ id: 1, name: "חלב וגבינות", slug: "dairy" }]),
    }),
  );
  // The picker debounces GET /cities?q=. One deterministic hit, so the typed
  // path (test 4) does not depend on whichever backend the target proxies to.
  await page.route("**/api/cities*", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["חיפה"]) }),
  );
  await page.route(REGISTER_POST, (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    capture.body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ whatsapp_sent: true }),
    });
  });
}

/** ACCOUNT → DETAILS with the other DETAILS fields filled, radio untouched. */
async function reachDetails(page: Page): Promise<void> {
  await page.goto("/register/producer");
  await page.getByTestId("register-preflight-start").click();
  await expect(page.getByTestId("register-frame-account")).toBeVisible();
  await page.getByTestId("register-account-name").fill("טסט בדיקה");
  await page.getByTestId("register-account-email").fill(`axis+${Date.now()}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await expect(page.getByTestId("register-frame-details")).toBeVisible();
  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
  await page.getByTestId("register-details-city").getByRole("option", { name: "תל אביב" }).first().click(); // MEH-2241 chunk B: the gate needs a picked town, not typed text
  // The question itself — the anchor a form without it fails on.
  await expect(page.getByTestId("register-fulfilment")).toBeVisible();
}

/** DETAILS → CATEGORY → STORY → submit. */
async function advanceAndSubmit(page: Page): Promise<void> {
  await page.getByTestId("register-details-next").click();
  await expect(page.getByTestId("register-frame-category")).toBeVisible();
  await page.getByTestId("category-chip-1").click();
  // MEH-952: the mocked category is license-required; the number is gated inline.
  await page.getByTestId("register-category-license").fill("1234567");
  await page.getByTestId("register-category-next").click();
  await expect(page.getByTestId("register-frame-story")).toBeVisible();
  await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
  await page.getByTestId("register-referral-source").selectOption("instagram");
  for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
    await cb.check();
  }
  await page.getByTestId("register-story-submit").click();
  await expect(page.getByTestId("register-frame-confirm")).toBeVisible({ timeout: 10_000 });
}

const OPTIONS = ["onsite", "delivery", "both"] as const;
const EXPECTED: Record<(typeof OPTIONS)[number], { has_physical_location: boolean; offers_delivery: boolean }> = {
  onsite: { has_physical_location: true, offers_delivery: false },
  delivery: { has_physical_location: false, offers_delivery: true },
  both: { has_physical_location: true, offers_delivery: true },
};

test.describe("MEH-2640 — «איך קונים אצלכם?» on DETAILS", () => {
  test("default: no option pre-selected, no error, the areas note is shown", async ({ page }) => {
    await mockBackend(page, { body: null });
    await reachDetails(page);
    for (const v of OPTIONS) await expect(page.getByTestId(`register-fulfilment-${v}`)).not.toBeChecked();
    await expect(page.getByTestId("register-fulfilment-error")).toHaveCount(0);
    await expect(page.getByTestId("register-delivery-note")).toBeVisible();
  });

  test("unanswered: «הבא» shows the error and DETAILS does not advance; answering clears it", async ({ page }) => {
    await mockBackend(page, { body: null });
    await reachDetails(page);
    await page.getByTestId("register-details-next").click();
    await expect(page.getByTestId("register-fulfilment-error")).toBeVisible();
    const advanced = await page
      .getByTestId("register-frame-category")
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    expect(advanced, "the required gate must block DETAILS → CATEGORY").toBe(false);
    await expect(page.getByTestId("register-frame-details")).toBeVisible();

    await page.getByTestId("register-fulfilment-delivery").check();
    await expect(page.getByTestId("register-fulfilment-error")).toHaveCount(0);
  });

  for (const v of OPTIONS) {
    test(`«${v}» reaches the POST body as its own pair of flags`, async ({ page }) => {
      const capture = { body: null as unknown };
      await mockBackend(page, capture);
      await reachDetails(page);
      await page.getByTestId(`register-fulfilment-${v}`).check();
      await advanceAndSubmit(page);
      const body = capture.body as Record<string, unknown>;
      expect(body, "the register POST must have been captured").not.toBeNull();
      expect(body.has_physical_location).toBe(EXPECTED[v].has_physical_location);
      expect(body.offers_delivery).toBe(EXPECTED[v].offers_delivery);
      // The re-cut must not keep posting what step 2 no longer collects.
      for (const gone of ["delivery_cities", "delivery_nationwide"]) {
        expect(body, `step 2 no longer collects ${gone}`).not.toHaveProperty(gone);
      }
      // The form state still carries an empty address/lat/lng (the dashboard
      // fills them later); whatever is sent must be empty, never a stale value.
      for (const empty of ["address", "lat", "lng"]) {
        expect(body[empty] ?? null, `${empty} is empty at registration`).toBeFalsy();
      }
    });
  }
});
