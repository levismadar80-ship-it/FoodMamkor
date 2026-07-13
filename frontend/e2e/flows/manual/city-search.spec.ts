import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     manual/city-search
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "Map city search width +
 *           dropdown z-index" (MEH-1171 conversion stage). First dedicated
 *           coverage of the CitySearch combobox — the matrix flagged it as
 *           reused on 3+ surfaces yet stubbed in every vitest and typed-only
 *           in the wizard e2e. Dropdown-occlusion items are asserted
 *           functionally: Playwright's click hit-testing fails on covered
 *           targets, so a successful option click proves the listbox paints
 *           ABOVE the Leaflet panes (the original z-index bug class).
 * Touches:  GET /cities reads only (seeded via scripts/local-backend.sh §4b).
 * Does NOT: assert pixel widths/truncation (visual) — value integrity and
 *           full-row option text are the functional equivalents used here.
 * History:  MEH-1171 (creation).
 */

const mapReady = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
  await page.goto("/map");
  await page.waitForLoadState("domcontentloaded");
  // MEH-549: race-free mount signal (two MapPane instances; see 05-map-navigation)
  await page.waitForFunction(
    () => (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !== undefined,
    { timeout: 45_000 },
  );
};

// the /map pane renders one combobox per MapPane instance — scope to the visible one
const cityBox = (page: Page) => page.getByRole("combobox").locator("visible=true").first();

test.describe("/map city search (MEH-1171 § city-search width + z-index)", () => {
  // MANUAL_TESTING § Map city search item 2 — suggestions render full rows
  test("typing a prefix lists the matching cities as full rows", async ({ page }) => {
    await mapReady(page);
    await cityBox(page).fill("ראש");
    const listbox = page.getByRole("listbox").locator("visible=true").first();
    await expect(listbox.getByRole("option", { name: "ראשון לציון" })).toBeVisible();
    await expect(listbox.getByRole("option", { name: "ראש העין" })).toBeVisible();
  });

  // MANUAL_TESTING § Map city search items 3 + 6 — option click fills the field;
  // a successful click ALSO proves the dropdown paints above the map panes
  // (hit-testing fails on occluded targets — the original z-index bug)
  test("clicking a suggestion fills the field (dropdown not occluded by the map)", async ({ page }) => {
    await mapReady(page);
    const box = cityBox(page);
    await box.fill("זכ");
    await page.getByRole("option", { name: "זכרון יעקב" }).locator("visible=true").first().click();
    await expect(box).toHaveValue("זכרון יעקב");
  });

  // MANUAL_TESTING § Map city search items 1 + 4 — manually typed full names
  // survive intact in the field (the width bug clipped long values)
  test("a long city name typed manually is kept intact in the field", async ({ page }) => {
    await mapReady(page);
    const box = cityBox(page);
    await box.fill("מעלה אדומים");
    await expect(box).toHaveValue("מעלה אדומים");
  });
});

// MANUAL_TESTING § Map city search item 7 — /register/producer regression:
// the wizard's city combobox still opens + selects (z-[1000] class)
test("producer wizard city combobox opens and selects (register regression)", async ({ page }) => {
  // REUSES 18-producer-register-wizard.spec.ts testid walk (frames are
  // testid-based since MEH-984); the wizard itself is spec 18's territory —
  // this only guards the CitySearch dropdown regression (item 7).
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
  await page.goto("/register/producer");
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-account-name").fill("בודקת עיר");
  await page.getByTestId("register-account-email").fill("qa-city@example.com");
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();

  const city = page.getByTestId("register-details-city").getByRole("combobox");
  await city.waitFor({ timeout: 15_000 });
  await city.fill("זכ");
  await page.getByRole("option", { name: "זכרון יעקב" }).first().click();
  await expect(city).toHaveValue("זכרון יעקב");
});
