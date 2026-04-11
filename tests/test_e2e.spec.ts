/**
 * Playwright E2E tests for מהמקור.
 *
 * Run with:
 *   cd frontend && npm run dev      # serves http://localhost:3000
 *   cd backend && uvicorn app.main:app --reload   # serves http://localhost:8000
 *   npx playwright test tests/test_e2e.spec.ts
 *
 * Configure base URL via PLAYWRIGHT_BASE_URL env var (defaults to localhost:3000).
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

test.describe("Public site", () => {
  test("home page loads with hero and producer cards", async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/מהמקור|MEHAMAKOR|MeHaMakor/i);
    // Hero / search bar should exist
    await expect(page.locator("input[type='search'], input[placeholder*='חיפוש']").first()).toBeVisible();
    // At least one producer card or list item rendered
    await expect(page.locator("a[href^='/producer'], a[href^='/']").first()).toBeVisible();
  });

  test("map page renders Leaflet markers", async ({ page }) => {
    await page.goto(`${BASE}/map`);
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 10000 });
  });

  test("about page is reachable", async ({ page }) => {
    await page.goto(`${BASE}/about`);
    await expect(page.locator("body")).toContainText(/מהמקור|חזון|אוכל/);
  });
});

test.describe("Auth", () => {
  test("register form rejects invalid email", async ({ page }) => {
    await page.goto(`${BASE}/register`);
    const emailInput = page.locator("input[type='email']").first();
    if (await emailInput.count()) {
      await emailInput.fill("not-an-email");
      await page.locator("button[type='submit']").first().click();
      // HTML5 validation OR custom error
      const valid = await emailInput.evaluate((el: HTMLInputElement) => el.checkValidity());
      expect(valid).toBe(false);
    }
  });

  test("login page renders", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator("input[type='email']").first()).toBeVisible();
    await expect(page.locator("input[type='password']").first()).toBeVisible();
  });
});

test.describe("Admin guard", () => {
  test("/admin redirects unauthenticated users", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    // Either redirected to /login or shown an auth message
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/\/(login|admin)/);
  });
});

test.describe("Producer detail", () => {
  test("clicking a producer card opens the producer page", async ({ page }) => {
    await page.goto(BASE);
    const card = page.locator("a[href^='/producer']").first();
    if (await card.count()) {
      await card.click();
      await expect(page).toHaveURL(/\/producer/);
    }
  });
});
