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

// MEH-1792 — this spec's locators used to hang off `page` directly, which made
// them flaky: during the client-side transition two page trees briefly co-mount,
// `getByTestId("delivery-day-row")` resolves to 2 elements, and strict mode
// throws before any wait can help. Observed in CI run 30637731250 (both matches
// carrying data-ghost="true"; failed at 2.3s, passed on retry at 3.2s).
//
// Two changes, and the second is the one that actually guarantees it:
//
// 1. Scope to `#main-content`, the layout landmark (layout.js:229). Deliberately
//    NOT the element under test — a guard that consults its own subject turns
//    "the row is gone" into "nothing to check" (.claude/rules/testing.md).
// 2. `settle()` below, asserting the count is exactly 1 before any strict
//    locator runs.
//
// Why both. The duplicate could NOT be reproduced locally — 8 plain runs and 6
// more under 8x CPU throttling, sampling every frame from before the first
// script via addInitScript, never saw more than one row. So the claim "the
// stray tree is outside #main-content" rests on inference from Playwright's own
// disambiguators in the CI error (it described match 1 as
// `locator('#main-content').getByTestId(...)`, which is only unique if exactly
// one row is inside the landmark), NOT on a measurement. Scoping alone would be
// an unverified fix. The count gate holds either way, because it RETRIES: if a
// stray ever does land inside the landmark, it waits for the transition instead
// of throwing.
//
// What it deliberately does not do: `.first()`. That would pass against a
// genuine permanent double-mount, which is a real bug worth failing on.
const scope = (page: import("@playwright/test").Page) => page.locator("#main-content");

// Gate on the transition being over. `toHaveCount` counts rather than resolving
// a single node, so it is immune to the strict-mode violation it exists to
// prevent, and it still fails loudly at 0 (row vanished) and at 2+ (real
// double-mount) — the two outcomes that must never be silently tolerated.
async function settle(page: import("@playwright/test").Page) {
  await expect(scope(page).getByTestId("delivery-day-row")).toHaveCount(1, {
    timeout: 15_000,
  });
}

test.describe("MEH-1771 delivery-day discoverability (390px)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile viewport spec");
  });

  test("ghost state: row is visible without a city, with a hint and disabled pills", async ({
    page,
  }) => {
    await page.goto("/");
    await settle(page);

    const row = scope(page).getByTestId("delivery-day-row");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("data-ghost", "true");

    // The hint is the whole point of the ghost state — it names the missing
    // precondition. Its absence would leave an inert row with no explanation.
    const hint = scope(page).getByTestId("delivery-day-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(/\S/);

    const pill = scope(page).getByTestId(`delivery-day-pill-${DAY}`);
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("aria-disabled", "true");
    // a11y: aria-describedby must resolve to the hint actually on the page.
    // Scoped too: a duplicated tree would duplicate the id, and an id lookup
    // that matches twice trips strict mode exactly like the testid did.
    const describedBy = await pill.getAttribute("aria-describedby");
    expect(describedBy, "ghost pill must reference the hint").toBeTruthy();
    await expect(scope(page).locator(`#${describedBy}`)).toHaveAttribute(
      "data-testid",
      "delivery-day-hint",
    );
  });

  test("ghost pill click opens the LocationModal (no new path)", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(scope(page).getByTestId("delivery-day-row")).toBeVisible({
      timeout: 15_000,
    });

    // aria-disabled, not the disabled attribute — the pill must still take a
    // click, or the ghost row is a dead end.
    //
    // `force: true` skips Playwright's actionability wait, which counts
    // aria-disabled="true" as "not enabled" and would time out. A real browser
    // does NOT block clicks on aria-disabled, so the wait — not the product —
    // is what force bypasses. The assertion still discriminates: had the pill
    // carried the real `disabled` attribute, Chromium would suppress the
    // handler even on a forced click and no dialog would appear.
    // The dialog stays page-level on purpose: the modal is not a descendant of
    // #main-content, so scoping it would match nothing and assert nothing.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await scope(page).getByTestId(`delivery-day-pill-${DAY}`).click({ force: true });
    await expect(page.getByRole("dialog")).toBeVisible();

    // The precondition is still enforced: no day landed in the URL.
    expect(new URL(page.url()).searchParams.get("day")).toBeNull();
  });

  test("active state: with a city the row is live and a day toggles (MEH-1645 intact)", async ({
    page,
  }) => {
    // This is the navigation the CI flake fired on — the ?city= transition.
    await page.goto(`/?city=${encodeURIComponent(CITY)}`);
    await settle(page);

    const row = scope(page).getByTestId("delivery-day-row");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("data-ghost", "false");
    await expect(scope(page).getByTestId("delivery-day-hint")).toHaveCount(0);

    const pill = scope(page).getByTestId(`delivery-day-pill-${DAY}`);
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
