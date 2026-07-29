import { test, expect } from "@playwright/test";

/**
 * MEH-1771 — delivery-day filter discoverability on the home surface.
 *
 * The day row used to render null without a city filter (MEH-1645 progressive
 * disclosure), so the filter was only ever found by accident. It is now a
 * permanent anchor: without a city it renders a muted "ghost" row plus a hint,
 * and tapping a ghost day opens the LocationModal to ask for the missing
 * precondition. With a city, the MEH-1645 behaviour is unchanged.
 *
 * NO MOCKS (e2e/CLAUDE.md, MEH-417). Nothing here depends on backend data:
 * the row's state is a function of the city filter alone, and `?city=` is the
 * MEH-1645 hydration path — so both states are reachable deterministically
 * regardless of what the live catalog contains.
 *
 * Mobile only, at the 390px viewport the ticket specifies. Gated on the static
 * project identity (testing.md: never gate on the element under test — a
 * `count()===0 → skip` would report green against a row that had vanished,
 * which is the exact regression this spec exists to catch).
 */

const CITY = "חיפה";
const DAY = "שישי";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("MEH-1771 delivery-day discoverability (390px)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile viewport spec");
  });

  test("ghost state: row is visible without a city, with a hint and disabled pills", async ({
    page,
  }) => {
    await page.goto("/");

    const row = page.getByTestId("delivery-day-row");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("data-ghost", "true");

    // The hint is the whole point of the ghost state — it names the missing
    // precondition. Its absence would leave an inert row with no explanation.
    const hint = page.getByTestId("delivery-day-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(/\S/);

    const pill = page.getByTestId(`delivery-day-pill-${DAY}`);
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("aria-disabled", "true");
    // a11y: aria-describedby must resolve to the hint actually on the page.
    const describedBy = await pill.getAttribute("aria-describedby");
    expect(describedBy, "ghost pill must reference the hint").toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toHaveAttribute(
      "data-testid",
      "delivery-day-hint",
    );
  });

  test("ghost pill click opens the LocationModal (no new path)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("delivery-day-row")).toBeVisible({ timeout: 15_000 });

    // aria-disabled, not the disabled attribute — the pill must still take a
    // click, or the ghost row is a dead end.
    //
    // `force: true` skips Playwright's actionability wait, which counts
    // aria-disabled="true" as "not enabled" and would time out. A real browser
    // does NOT block clicks on aria-disabled, so the wait — not the product —
    // is what force bypasses. The assertion still discriminates: had the pill
    // carried the real `disabled` attribute, Chromium would suppress the
    // handler even on a forced click and no dialog would appear.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByTestId(`delivery-day-pill-${DAY}`).click({ force: true });
    await expect(page.getByRole("dialog")).toBeVisible();

    // The precondition is still enforced: no day landed in the URL.
    expect(new URL(page.url()).searchParams.get("day")).toBeNull();
  });

  test("active state: with a city the row is live and a day toggles (MEH-1645 intact)", async ({
    page,
  }) => {
    await page.goto(`/?city=${encodeURIComponent(CITY)}`);

    const row = page.getByTestId("delivery-day-row");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("data-ghost", "false");
    await expect(page.getByTestId("delivery-day-hint")).toHaveCount(0);

    const pill = page.getByTestId(`delivery-day-pill-${DAY}`);
    await expect(pill).toHaveAttribute("aria-disabled", "false");
    await expect(pill).toHaveAttribute("aria-pressed", "false");

    await pill.click();
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`day=${encodeURIComponent(DAY)}`));
    // No modal — the precondition is satisfied, so the click filters instead.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Tapping the active day again clears it (MEH-1645 toggle).
    await pill.click();
    await expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(new URL(page.url()).searchParams.get("day")).toBeNull();
  });
});
