import { test, expect } from "./_cloudinary-stub";

/**
 * MEH-1771 → MEH-2186 — delivery-day filter discoverability on the home surface.
 *
 * MEH-1645 rendered the day row as null without a city, so the filter was only
 * ever found by accident. MEH-1771 made it a permanent anchor: a muted "ghost"
 * row plus a hint, whose pills carried a disabled ARIA flag while remaining
 * clickable, so a tap could open the LocationModal.
 *
 * MEH-2186 keeps the ANCHOR and replaces its FORM. There is now one always-
 * visible chip; the seven pills moved into a panel it opens. What this spec
 * guards is unchanged in substance and that is why it keeps its name:
 *
 *   1. the axis is reachable without a city (the anchor MEH-1771 established)
 *   2. tapping it with no city asks for the missing precondition, and applies
 *      no filter
 *   3. with a city, a day still toggles and still lands in the URL
 *
 * The ghost pills are gone, and with them the contradiction they encoded: they
 * LOOKED inert and WERE clickable. The `force: true` this spec needed to click
 * one is therefore gone too — the chip is genuinely enabled, so Playwright's
 * own actionability wait now passes on its merits rather than being bypassed.
 * That is a strengthening of the test, not a loosening: `force` suppressed the
 * exact check that would notice a control becoming unclickable.
 *
 * NO MOCKS (e2e/CLAUDE.md, MEH-417). Nothing here depends on backend data: the
 * chip's state is a function of the city filter alone, and `?city=` is the
 * MEH-1645 hydration path — so every state is reachable deterministically
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
//
// MEH-2186 keeps all of the above verbatim. The reshape did not touch the
// transition this guards, and the root element still carries the same testid.
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

/** MEH-2186: the pills live behind the chip, so the count is the closed/open
 *  discriminator. Counted, never "at least one" — "some pills exist" passes on
 *  a duplicated panel, which is the orphan-cell shape MEH-1583 shipped. */
const pills = (page: import("@playwright/test").Page) =>
  scope(page).locator('[data-testid^="delivery-day-pill-"]');

test.describe("MEH-1771 delivery-day discoverability (390px)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile viewport spec");
  });

  test("anchor state: the chip is visible without a city, idle, and nothing is inert", async ({
    page,
  }) => {
    await page.goto("/");
    await settle(page);

    const row = scope(page).getByTestId("delivery-day-row");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("data-ghost", "true");

    // The anchor itself — MEH-1771's guarantee, in its MEH-2186 form.
    const chip = scope(page).getByTestId("delivery-day-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(/\S/);
    await expect(chip).toBeEnabled();
    await expect(chip).toHaveAttribute("aria-expanded", "false");

    // Closed means closed: no panel, and ZERO pills anywhere in the landmark.
    await expect(scope(page).getByTestId("delivery-day-panel")).toHaveCount(0);
    await expect(pills(page)).toHaveCount(0);

    // The defect MEH-2186 closed: nothing may look inert while staying
    // clickable. There is no longer anything in this row to mark as disabled.
    await expect(row.locator("[aria-disabled]")).toHaveCount(0);

    // No day is selected, so the chip carries no clear button.
    await expect(scope(page).getByTestId("delivery-day-clear")).toHaveCount(0);
  });

  test("chip tap with no city opens the LocationModal (no new path)", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(scope(page).getByTestId("delivery-day-chip")).toBeVisible({
      timeout: 15_000,
    });

    // No `force`. The pre-MEH-2186 pill needed it because its disabled ARIA
    // flag made Playwright consider the control not-enabled; the chip is a
    // plain enabled button, so the actionability wait runs for real and this
    // click would fail if the control ever stopped being clickable.
    //
    // The dialog stays page-level on purpose: the modal is not a descendant of
    // #main-content, so scoping it would match nothing and assert nothing.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await scope(page).getByTestId("delivery-day-chip").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // It asked for the precondition instead of pretending to filter: no panel
    // opened, and no day landed in the URL.
    await expect(scope(page).getByTestId("delivery-day-panel")).toHaveCount(0);
    await expect(pills(page)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("day")).toBeNull();
  });

  test("active state: with a city the chip opens the panel and a day toggles (MEH-1645 intact)", async ({
    page,
  }) => {
    // This is the navigation the MEH-1792 CI flake fired on — the ?city= transition.
    await page.goto(`/?city=${encodeURIComponent(CITY)}`);
    await settle(page);

    const row = scope(page).getByTestId("delivery-day-row");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("data-ghost", "false");

    // Still closed on arrival — a city does not auto-open the panel.
    await expect(pills(page)).toHaveCount(0);

    await scope(page).getByTestId("delivery-day-chip").click();
    await expect(scope(page).getByTestId("delivery-day-panel")).toBeVisible();
    // EXACTLY seven. An eighth (a stray day, a duplicated panel) fails here.
    await expect(pills(page)).toHaveCount(7);
    await expect(scope(page).getByTestId("delivery-day-panel-hint")).toContainText(CITY);

    const pill = scope(page).getByTestId(`delivery-day-pill-${DAY}`);
    await expect(pill).toHaveAttribute("aria-pressed", "false");

    await pill.click();
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`day=${encodeURIComponent(DAY)}`));
    // No modal — the precondition is satisfied, so the click filters instead.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The panel survives the selection. Closing per tap is the mutually-
    // exclusive-facet defect Baymard puts in the top 15% of filtering failures.
    await expect(pills(page)).toHaveCount(7);
    // ...and the chip now carries the value plus its own clear button.
    await expect(scope(page).getByTestId("delivery-day-chip")).toContainText(DAY);
    await expect(scope(page).getByTestId("delivery-day-clear")).toBeVisible();

    // Tapping the active day again clears it (MEH-1645 toggle, unchanged).
    await pill.click();
    await expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(new URL(page.url()).searchParams.get("day")).toBeNull();
  });

  test("the chip's clear button drops the day and keeps the city (MEH-2186)", async ({
    page,
  }) => {
    // Deep-linked, so this exercises the hydration path rather than a click
    // sequence — the day arrives from the URL exactly as a shared link delivers it.
    await page.goto(`/?city=${encodeURIComponent(CITY)}&day=${encodeURIComponent(DAY)}`);
    await settle(page);

    const chip = scope(page).getByTestId("delivery-day-chip");
    await expect(chip).toContainText(DAY);

    await scope(page).getByTestId("delivery-day-clear").click();

    // The day axis is cleared...
    await expect.poll(() => new URL(page.url()).searchParams.get("day")).toBeNull();
    await expect(scope(page).getByTestId("delivery-day-clear")).toHaveCount(0);
    // ...and the CITY is untouched, which is the whole point of splitting the
    // two clear controls apart. The row is still live, not back to ghost.
    expect(new URL(page.url()).searchParams.get("city")).toBe(CITY);
    await expect(scope(page).getByTestId("delivery-day-row")).toHaveAttribute(
      "data-ghost",
      "false",
    );
    // Clearing is not a disclosure: it must not have opened the panel.
    await expect(pills(page)).toHaveCount(0);
  });
});
