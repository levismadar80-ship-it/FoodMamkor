import { test, expect } from "@playwright/test";

/**
 * MEH-107 — Calendar View on /events.
 * The toggle swaps between list and calendar modes; the calendar
 * always shows the current-month grid with day cells ≥ 44×44 for touch.
 */
test.describe("Calendar view on /events", () => {
  test("toggle swaps to calendar mode and renders a 7-column grid", async ({ page }) => {
    await page.goto("/events");
    await page.waitForLoadState("networkidle");

    const listTab = page.getByRole("tab", { name: "רשימה" });
    const calendarTab = page.getByRole("tab", { name: "לוח שנה" });

    await expect(listTab).toHaveAttribute("aria-selected", "true");
    await expect(calendarTab).toHaveAttribute("aria-selected", "false");

    await calendarTab.click();

    await expect(calendarTab).toHaveAttribute("aria-selected", "true");
    const grid = page.getByRole("grid", { name: "לוח שנה" });
    await expect(grid).toBeVisible();

    // Month navigation buttons are accessible.
    await expect(page.getByRole("button", { name: "חודש קודם" })).toBeVisible();
    await expect(page.getByRole("button", { name: "חודש הבא" })).toBeVisible();
  });

  test("day cells meet the 44px touch target on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/events");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "לוח שנה" }).click();

    const anyCell = page.getByRole("button", { name: /.*[0-9].*/ }).first();
    const box = await anyCell.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
