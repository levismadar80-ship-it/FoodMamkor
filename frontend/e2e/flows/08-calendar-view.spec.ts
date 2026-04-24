import { test, expect } from "@playwright/test";

/**
 * MEH-107 — Calendar View on /events.
 * The toggle swaps between list and calendar modes; the calendar
 * always shows the current-month grid with day cells ≥ 44×44 for touch.
 */
test.describe("Calendar view on /events", () => {
  test("toggle swaps to calendar mode and renders the grid", async ({ page }) => {
    await page.goto("/events");
    await page.waitForLoadState("domcontentloaded");
    // View-mode tablist is always rendered (not data-dependent) — explicit wait
    // avoids flaky getByRole assertions if React hydration is still settling.
    await page.waitForSelector('[role="tablist"][aria-label="\u05de\u05e6\u05d1 \u05ea\u05e6\u05d5\u05d2\u05d4"]', { timeout: 10_000 });

    const listTab = page.getByRole("tab", { name: "רשימה", exact: true });
    const calendarTab = page.getByRole("tab", { name: "לוח שנה", exact: true });

    await expect(listTab).toBeVisible();
    await expect(calendarTab).toBeVisible();
    await expect(listTab).toHaveAttribute("aria-selected", "true");

    await calendarTab.click();

    await expect(calendarTab).toHaveAttribute("aria-selected", "true");
    const grid = page.getByRole("grid", { name: "לוח שנה" });
    await expect(grid).toBeVisible();

    await expect(page.getByRole("button", { name: "חודש קודם" })).toBeVisible();
    await expect(page.getByRole("button", { name: "חודש הבא" })).toBeVisible();
  });

  test("day cells meet the 44px touch target", async ({ page }) => {
    await page.goto("/events");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector('[role="tablist"][aria-label="מצב תצוגה"]', { timeout: 10_000 });
    await page.getByRole("tab", { name: "לוח שנה", exact: true }).click();

    const grid = page.getByRole("grid", { name: "לוח שנה" });
    await expect(grid).toBeVisible();

    // Day cells are the only buttons inside the grid that carry aria-pressed.
    const dayCell = grid.locator("button[aria-pressed]").first();
    await expect(dayCell).toBeVisible();
    const box = await dayCell.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
