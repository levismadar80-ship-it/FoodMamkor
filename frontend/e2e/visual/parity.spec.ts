import { test, expect, type Page } from "@playwright/test";
import * as path from "path";

/**
 * MEH-991 Chunk 3 — visual parity baselines (VRT).
 * Baselines refreshed 2026-07-11 after MEH-1103 (#1592/#1595 header/footer
 * accessibility sizing) landed — the footer grew 20px on every fullPage route.
 *
 * Locks the design-parity sweep (Groups 1-5, gold #896714, header pill,
 * hero CTA, footer, static pages) against silent drift. One screenshot per
 * route per project (desktop 1440x900 + mobile Pixel 5), compared with
 * maxDiffPixelRatio 0.02 (playwright.config.ts expect.toHaveScreenshot).
 *
 * Determinism strategy (no mocks — MEH-417):
 * - Live-data regions (producers grid, events preview, mini-map, Leaflet
 *   tiles) are MASKED — layout chrome is the subject under test, data isn't.
 * - Calendar-dependent banners (holiday / friday-delivery) are HIDDEN via
 *   parity.css — their *presence* varies, and a mask can't absorb the layout
 *   shift of a section that appears and disappears with the date.
 * - Data-dependent routes shoot the viewport only (below-the-fold sections
 *   self-hide on empty data → fullPage height is unstable). The static trio
 *   (/about /login /register) shoots fullPage.
 *
 * Baseline maintenance: baselines are generated ON THE CI RUNNER via the
 * vrt-update.yml workflow_dispatch (never from a dev machine — font stacks
 * differ). MEH-1103: header sizing recalibration (nav text-base, pill
 * py-1.5/px-6, logo 111×42) intentionally invalidated every header-bearing
 * baseline — this edit rides the vrt-update push trigger to refresh them.
 * After an intentional visual change: run vrt-update on the branch,
 * review the committed baseline diff, merge. Staging-data drift that alters
 * a masked region's size (e.g. producer count changes the grid height) is
 * refreshed the same way.
 */

const STYLE_PATH = path.join(__dirname, "parity.css");

/** Screenshot options shared by every route. */
const SHOT = { stylePath: STYLE_PATH } as const;

/**
 * Neutralize pre-page state that changes rendering: cookie-consent banner
 * (localStorage) and the verify-email banner's per-session dismiss flag is
 * left unset — logged-out pages never render it.
 */
async function preparePage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookieConsent", "essential");
    } catch {
      /* storage unavailable — banner hidden by parity.css anyway */
    }
  });
}

/** Wait for fonts + a settle beat so text renders identically run-to-run. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {
    /* long-polling/streaming must not fail the shot — fonts are the gate */
  });
  await page.waitForTimeout(500);
}

test.describe("Visual parity — MEH-991", () => {
  test("home", async ({ page }) => {
    await preparePage(page);
    await page.goto("/");
    // Scoped to the hero's role="search" card — the header mounts a second
    // (hidden) HeroSearch instance, so the bare testid is ambiguous under
    // strict mode.
    await expect(
      page.getByRole("search").locator('[data-testid="hero-search"]')
    ).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("home.png", {
      ...SHOT,
      // Live data: featured grid + events preview + homepage mini-map.
      mask: [
        page.locator("#producers-grid"),
        page.locator(".leaflet-container"),
        page.locator('[data-testid="producer-card"]'),
      ],
    });
  });

  test("map", async ({ page }) => {
    test.setTimeout(90_000);
    await preparePage(page);
    await page.goto("/map");
    // MEH-549 pattern (flow 05): __MAP_CENTER__ is race-free across the two
    // MapPane instances; .leaflet-container:visible is not.
    await page.waitForFunction(
      () =>
        (window as unknown as { __MAP_CENTER__?: [number, number] })
          .__MAP_CENTER__ !== undefined,
      { timeout: 45_000 }
    );
    await settle(page);
    await expect(page).toHaveScreenshot("map.png", {
      ...SHOT,
      // Tiles + markers are live; chrome (header, filters, controls) is not.
      mask: [page.locator(".leaflet-container")],
    });
  });

  test("producer detail", async ({ page }) => {
    await preparePage(page);
    await page.goto("/producers");
    const firstCard = page.locator('[data-testid="producer-card"]').first();
    await page.waitForLoadState("domcontentloaded");
    if ((await firstCard.count()) === 0) {
      // Same graceful skip as flows/03 — an empty staging DB is a data
      // problem, not a layout regression.
      test.skip(true, "No producer cards found — staging DB may be empty");
      return;
    }
    await expect(firstCard).toBeVisible({ timeout: 20_000 });
    await firstCard.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/producers"), {
      timeout: 20_000,
    });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("producer-detail.png", {
      ...SHOT,
      // The producer itself is live data: name, photos, rating counts and the
      // review excerpt all vary. Layout chrome (gallery grid geometry, trust
      // strip, CTA hierarchy, sticky bar) is the subject.
      mask: [
        page.locator("main h1"),
        page.locator("main img"),
        page.locator('a[href="#reviews"]'),
        page.locator(".leaflet-container"),
      ],
    });
  });

  test("about", async ({ page }) => {
    await preparePage(page);
    await page.goto("/about");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("about.png", {
      ...SHOT,
      fullPage: true,
      // Cloudinary portrait — external asset, not layout.
      mask: [page.locator("main img")],
    });
  });

  test("login", async ({ page }) => {
    await preparePage(page);
    await page.goto("/login");
    await expect(page.locator("form").first()).toBeVisible({
      timeout: 20_000,
    });
    await settle(page);
    await expect(page).toHaveScreenshot("login.png", {
      ...SHOT,
      fullPage: true,
    });
  });

  test("register", async ({ page }) => {
    await preparePage(page);
    await page.goto("/register");
    await expect(page.locator("form").first()).toBeVisible({
      timeout: 20_000,
    });
    await settle(page);
    await expect(page).toHaveScreenshot("register.png", {
      ...SHOT,
      fullPage: true,
    });
  });
});
