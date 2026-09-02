import { test, expect, type Page, type Route } from "./_cloudinary-stub";
import { REGIONS } from "../../data/regions";

/**
 * Spec:     38-register-delivery-axis
 * Purpose:  MEH-2107 — the registration delivery axis (MEH-1838 chunk B)
 *           shipped with vitest and screenshots only; flows/18 walks THROUGH
 *           the DETAILS frame without touching a single axis control. This
 *           spec drives the controls and asserts what reaches the POST body.
 * Touches:  /register/producer, rendered. Three endpoints route-mocked —
 *           GET /categories (CATEGORY frame), GET /api/cities (the picker's
 *           autocomplete), POST /auth/register/producer (captured, never
 *           reached). A register spec against staging would create real
 *           businesses on a shared target with no teardown (MEH-1502), and the
 *           mutation check in the card's DoD needs a build, not a deploy — so
 *           this targets the local `next start` CI already runs (MEH-1044),
 *           exactly like flows/18. Same mocking rationale as flows/18 and /29.
 * Does NOT: assert backend validation (schemas.py:857+ owns that, with pytest),
 *           the CitiesAutocomplete internals (its own tests), or Hebrew copy —
 *           every locator is a data-testid, region names are DATA
 *           (data/regions.js), read from the same module the picker reads.
 * History:  MEH-2107 (creation).
 *
 * ── THE FIVE-STATE MATRIX (CLAUDE.md), because the axis is three reveals ────
 *   axis error        : hidden (default)      / shown (both flags off)
 *   delivery sub-block: closed (default)      / open (offers_delivery on)
 *   cities block      : closed (nationwide on)/ open (nationwide off), and
 *                       inside it: 0 cities → error shown / ≥1 → hidden
 * Each cell below is asserted on the real DOM, not inferred from the default.
 *
 * ── MUTATION CHECK (the DoD's "the spec FAILS if the axis block is removed") ─
 * Every test here starts by asserting `register-delivery-axis` is visible, so
 * a form without the block fails at the first line rather than passing
 * through — and the POST-body tests fail a second way (the flags keep their
 * defaults). Demonstrated on 01/09 against a build with the block hidden:
 * the PR body carries both runs.
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

/** ACCOUNT → DETAILS with the DETAILS required fields filled, axis untouched. */
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
  await page.getByTestId("register-details-address").fill("הרצל 1");
  // The block itself — this is the mutation-check anchor (header note).
  await expect(page.getByTestId("register-delivery-axis")).toBeVisible();
}

/** DETAILS → CATEGORY → STORY → submit. Assumes the axis is valid. */
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

test.describe("MEH-2107 — registration delivery axis", () => {
  test("default state: physical on, delivery off, no error, sub-block closed", async ({ page }) => {
    const capture = { body: null as unknown };
    await mockBackend(page, capture);
    await reachDetails(page);

    await expect(page.getByTestId("register-has-physical-location")).toBeChecked();
    await expect(page.getByTestId("register-offers-delivery")).not.toBeChecked();
    await expect(page.getByTestId("register-delivery-axis-error")).toHaveCount(0);
    await expect(page.getByTestId("register-delivery-nationwide")).toHaveCount(0);
    await expect(page.getByTestId("register-delivery-cities")).toHaveCount(0);
  });

  test("physical off + delivery off: the error shows and DETAILS does not advance", async ({ page }) => {
    const capture = { body: null as unknown };
    await mockBackend(page, capture);
    await reachDetails(page);

    await page.getByTestId("register-has-physical-location").uncheck();
    await expect(page.getByTestId("register-delivery-axis-error")).toBeVisible();

    await page.getByTestId("register-details-next").click();
    // Inverted wait: the frame must NOT change. A bounded check that the next
    // frame never appears, then the positive assertion that we are still here.
    const advanced = await page
      .getByTestId("register-frame-category")
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    expect(advanced, "the client-side gate must block DETAILS → CATEGORY").toBe(false);
    await expect(page.getByTestId("register-frame-details")).toBeVisible();

    // Recovery: ticking either flag clears the error — the gate discriminates.
    await page.getByTestId("register-offers-delivery").check();
    await expect(page.getByTestId("register-delivery-axis-error")).toHaveCount(0);
  });

  test("delivery on + nationwide off: city selection is reachable, empty blocks, a region chip fills it — and the list reaches the POST body", async ({ page }) => {
    const capture = { body: null as unknown };
    await mockBackend(page, capture);
    await reachDetails(page);

    await page.getByTestId("register-has-physical-location").uncheck();
    await page.getByTestId("register-offers-delivery").check();
    // Sub-block open, nationwide off by default → the cities block is open and
    // EMPTY, which the inline error says is not enough.
    await expect(page.getByTestId("register-delivery-nationwide")).not.toBeChecked();
    const cities = page.getByTestId("register-delivery-cities");
    await expect(cities).toBeVisible();
    await expect(page.getByTestId("register-delivery-cities-error")).toBeVisible();

    // Region quick-add (MEH-1256): one click adds the region's whole city list
    // from data/regions.js — no network, no copy. Read the expected list from
    // the same module the component reads, so this asserts the DATA arrived,
    // not "something non-empty".
    const region = REGIONS[0];
    // Anchored regex, not `exact`: once pressed the chip's accessible name
    // becomes "<region> · ✓ <added>", so an exact match would lose the element
    // right after the click and report "not found" instead of the state.
    const chip = cities.getByRole("button", {
      name: new RegExp(`^${region.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    });
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("register-delivery-cities-error")).toHaveCount(0);

    await advanceAndSubmit(page);
    const body = capture.body as Record<string, unknown>;
    expect(body, "the register POST must have been captured").not.toBeNull();
    expect(body.has_physical_location).toBe(false);
    expect(body.offers_delivery).toBe(true);
    expect(body.delivery_nationwide).toBe(false);
    expect(body.delivery_cities).toEqual(region.cities);
  });

  test("delivery on + nationwide on: the cities block closes and the body carries the flag with no city list", async ({ page }) => {
    const capture = { body: null as unknown };
    await mockBackend(page, capture);
    await reachDetails(page);

    await page.getByTestId("register-offers-delivery").check();
    // Type one city first, so the nationwide toggle has something to clear —
    // the XOR the validator enforces (schemas.py:857+) must be visible here.
    const input = page.getByTestId("register-delivery-cities").getByRole("combobox");
    await input.fill("חיפה");
    // The picker debounces GET /cities and Enter commits only a loaded exact
    // match — wait for the (mocked) suggestion to be listed, then commit.
    await expect(page.getByRole("listbox").getByRole("option", { name: "חיפה" })).toBeVisible();
    await input.press("Enter");
    await expect(page.getByTestId("register-delivery-cities-error")).toHaveCount(0);

    await page.getByTestId("register-delivery-nationwide").check();
    await expect(page.getByTestId("register-delivery-cities")).toHaveCount(0);

    await advanceAndSubmit(page);
    const body = capture.body as Record<string, unknown>;
    expect(body).not.toBeNull();
    expect(body.has_physical_location).toBe(true);
    expect(body.offers_delivery).toBe(true);
    expect(body.delivery_nationwide).toBe(true);
    expect(body, "nationwide must not carry a city list (XOR)").not.toHaveProperty("delivery_cities");
  });
});
