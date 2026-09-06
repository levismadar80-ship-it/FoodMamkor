import { test, expect, type Route } from "./_cloudinary-stub";

/**
 * MEH-2241 chunk B — «free-text city forbidden» (MEH-213) is enforced at the
 * DETAILS→CATEGORY gate of /register/producer.
 *
 * What the card measured on staging (02/09): an empty city blocked (A), a
 * town picked from the list advanced (B), and a typed town with 0 suggestions
 * that was never picked ALSO advanced (C) — the gate only checked for empty.
 * Chunk A (MEH-2270) made CitySearch report `{ known }`; this spec pins the
 * three cells of the 5-state rule on the gate that now consumes it.
 *
 * Intercepts (frontend/e2e/CLAUDE.md, MEH-1968 "Option A" — all three hold):
 *   GET /api/cities* → one deterministic answer per test, because the verdict
 *   under test is the frontend's ("is this value a town the picker vouches
 *   for"), the endpoint's contract is the MEH-1343 prefix search (a JSON list
 *   of names), and nothing here asserts what the backend computes. Same
 *   precedent as flows/38:53. No POST is ever reached — every case stops on
 *   or before the CATEGORY frame.
 *
 * Selectors are data-testid (docs/E2E-LOCATORS.md); the city input is the
 * combobox inside `register-details-city` (CitySearch owns the input,
 * flows/18:71).
 */

// "תל אביב" is in the static list (data/cities.js), so it is known with or
// without a backend answer; the free-text town matches nothing anywhere.
const KNOWN_TOWN = "תל אביב";
const FREE_TEXT_TOWN = "עיירה שאינה ברשימה";

async function reachDetails(page) {
  await page.goto("/register/producer");
  await page.getByTestId("register-preflight-start").click();
  await expect(page.getByTestId("register-frame-account")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("register-account-name").fill("טסט בדיקה");
  await page.getByTestId("register-account-email").fill(`city+${Date.now()}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await expect(page.getByTestId("register-frame-details")).toBeVisible();
  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
}

test.describe("MEH-2241 chunk B — the city gate refuses a typed town the picker could not match", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/categories", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: 1, name: "חלב וגבינות", slug: "dairy" }]),
      }),
    );
    // The canonical table knows nothing the static list does not — so the
    // only towns the picker can vouch for in this spec are the static 102.
    await page.route("**/api/cities*", (route: Route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
  });

  test("A — empty city: the advance is blocked at the field with the city message", async ({ page }) => {
    await reachDetails(page);
    await page.getByTestId("register-details-next").click();
    await expect(page.getByTestId("register-frame-details")).toBeVisible();
    await expect(page.getByTestId("register-frame-category")).toHaveCount(0);
    await expect(page.locator("#register-city-error")).toBeVisible();
  });

  test("B — a town from the list: the advance succeeds", async ({ page }) => {
    await reachDetails(page);
    const city = page.getByTestId("register-details-city").getByRole("combobox");
    await city.fill(KNOWN_TOWN);
    // pick it from the dropdown, the way a seller does — not just type it
    await page.getByRole("option", { name: KNOWN_TOWN }).first().click();
    await page.getByTestId("register-details-next").click();
    await expect(page.getByTestId("register-frame-category")).toBeVisible();
  });

  test("C — a typed town with 0 suggestions, never picked: blocked exactly like empty", async ({ page }) => {
    await reachDetails(page);
    const city = page.getByTestId("register-details-city").getByRole("combobox");
    await city.fill(FREE_TEXT_TOWN);
    // no dropdown to pick from — that is the case
    await expect(page.getByRole("option")).toHaveCount(0);
    await page.getByTestId("register-details-next").click();
    await expect(page.getByTestId("register-frame-details")).toBeVisible();
    await expect(page.getByTestId("register-frame-category")).toHaveCount(0);
    await expect(page.locator("#register-city-error")).toBeVisible();
    await expect(city).toHaveAttribute("aria-invalid", "true");
    await expect(city).toBeFocused();
    // correcting it to a real town clears the block (Baymard on-change clear)
    await city.fill(KNOWN_TOWN);
    await page.getByRole("option", { name: KNOWN_TOWN }).first().click();
    await expect(page.locator("#register-city-error")).toHaveCount(0);
    await page.getByTestId("register-details-next").click();
    await expect(page.getByTestId("register-frame-category")).toBeVisible();
  });
});
