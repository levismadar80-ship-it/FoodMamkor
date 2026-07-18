import { test, expect, type Page } from "@playwright/test";
import * as path from "path";

/**
 * MEH-991 Chunk 3 — visual parity baselines (VRT).
 * Baselines refreshed 2026-07-12 after MEH-1128 Wave D2 — the consumer
 * /register name + email fields adopted ui/Input (label slot + success
 * state), so register-*.png shifts; this touch retriggers the vrt-update
 * bot to regenerate the baseline on the runner (sandbox fonts differ).
 * Baselines refreshed 2026-07-11 after MEH-1103 (#1592/#1595 header/footer
 * accessibility sizing) landed — the footer grew 20px on every fullPage route.
 * MEH-1135 (2026-07-12): chat FAB migrated to logical `insetInlineEnd`, moving
 * it from bottom-right to bottom-left in RTL — an approved visual change. This
 * touch re-triggers the vrt-update bot to regenerate the affected baselines
 * (map + producer-detail chrome capture the FAB corner). Not a regression.
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
 * MEH-1103 PR-5: refreshed again from post-sweep staging — PR #1595's footer
 * recalibration (utility links 13px + 44px targets) merged without a baseline
 * refresh, so the fullPage trio (/about /login /register) was stale.
 * After an intentional visual change: run vrt-update on the branch,
 * review the committed baseline diff, merge. Staging-data drift that alters
 * a masked region's size (e.g. producer count changes the grid height) is
 * refreshed the same way.
 * MEH-991 (2026-07-13): refresh the fullPage trio (/about /login /register)
 * after MEH-1160 (#1689) added the "ספרו עלינו" → /share footer link — the
 * 8th footer nav entry grows every fullPage route; /login + /register also
 * carry the MEH-1145/MEH-1128 ui/Input adoption (resting-state invisible).
 * Classified intended drift, no regression. This touch re-triggers the
 * vrt-update bot to regenerate the baselines on the runner.
 * MEH-1295 (2026-07-17): the MEH-1177/1278/1281 footer cluster (nav audience
 * split, mobile 2-col grid, 13px semibold group headings) shifted every
 * fullPage route's height (mobile −61px, desktop +82px) since the last regen,
 * red-lining the /about /login /register trio. Verified footer-only (A/B render
 * of 25b990e8 vs staging HEAD — first diff row 62–92% down each page, no shift
 * above). This touch re-fires vrt-update to regenerate the trio on the runner
 * (the earlier delete-trigger run regenerated them but its commit step was
 * skipped when the unrelated /producer/[id] nav flake failed the suite).
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
  // MEH-1328 (2026-07-18): the home hero/trust copy changed in MEH-1308 (#1904,
  // "עסקים" → "בתי עסק" across home.hero.subtitle / cta_primary / home.trust.lead),
  // red-lining the viewport-only home baseline against the now-stale copy. This
  // touch re-triggers vrt-update.yml so home-{mobile,desktop}-linux.png are
  // regenerated on-runner. Delta is confined to the hero region — the home shot
  // is viewport-only (no fullPage), so the footer/BackToTop/chip changes that
  // also merged 2026-07-18 sit below the fold and out of frame.
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

  // MEH-1146: the producer detail page IA was rebuilt across PRs #1670/#1673/#1676
  // (editorial contact card, two-tier header, section reorder, discovery loop).
  // This touch re-triggers vrt-update.yml so the producer-detail-*-linux.png
  // baselines are regenerated on-runner against the final design.
  // MEH-1197 follow-up (2026-07-13): the /producers visual language changed again
  // after the 13:37 baseline — MEH-1186 (#1732, one visual language per behavior)
  // and MEH-1173 (#1727) — red-lining producer-detail-mobile against a now-stale
  // snapshot. This touch re-triggers vrt-update.yml to refresh the baselines.
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

  // MEH-1112: /about polish (pull-quote column narrowed, testimonials section
  // render-gated off, close-band CTA hierarchy, contact email fallback line)
  // is an intentional visual change — this touch re-rides vrt-update.yml so the
  // about-{desktop,mobile}-linux baselines regenerate on the runner (MEH-991 flow).
  // MEH-1113: the contact form gains a "נושא הפנייה" topic select above the
  // message field — another intentional /about visual change, so the baselines
  // regenerate again on this branch via the same vrt-update re-ride.
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
