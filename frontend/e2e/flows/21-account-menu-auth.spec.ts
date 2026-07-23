import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * MEH-1241 proof-of-value — the QA that was blocked on MEH-1226 + MEH-1228.
 * Drives the authenticated producer + consumer sessions provisioned by
 * e2e/global-setup.ts (test.use({ storageState })) to verify the shipped
 * account-menu behavior against a real logged-in user:
 *   - producer desktop UserMenu: order (dashboard → profile → settings),
 *     profile → the PUBLIC /producer/[id] (a UUID, not /producer/undefined),
 *     settings → plain /settings.
 *   - consumer desktop UserMenu: settings + logout only, no profile row.
 *   - producer mobile AccountSheet (375px): first row = dashboard → /producer/dashboard.
 *
 * Runs only against a real staging/preview target: global-setup no-ops on a
 * localhost baseURL, so the storageState files don't exist there — the describes
 * skip (keeping the default localhost CI E2E green, MEH-1044). Against
 * TEST_URL=staging (after Sapir runs `--sync-users`), they execute.
 *
 * Selectors intentionally assert the Hebrew menu copy (account.menu.*) because
 * MEH-1226/1228 are about that exact copy + href contract, not a data-testid.
 */
const AUTH_DIR = path.join(__dirname, "..", ".auth");
const producerAuth = path.join(AUTH_DIR, "producer.json");
const consumerAuth = path.join(AUTH_DIR, "consumer.json");

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_URL || "http://localhost:3000";
const isLocal = /localhost|127\.0\.0\.1/.test(baseURL);
const skipReason = "auth storageState is provisioned against staging only (global-setup no-ops on localhost)";

// The visible account trigger — Header UserMenu on desktop (hidden md:block),
// BottomNav account tab on mobile (md:hidden). Both carry aria-label
// "תפריט — {name}"; :visible resolves to the one shown at the current viewport.
const accountTrigger = 'button[aria-label^="תפריט"]:visible';

test.describe("producer account menu — desktop (MEH-1226)", () => {
  test.skip(isLocal || !fs.existsSync(producerAuth), skipReason);
  test.use({ storageState: producerAuth, viewport: { width: 1280, height: 900 } });

  test("dashboard leads; profile → public /producer/[id]; settings → /settings", async ({ page }, testInfo) => {
    // Header UserMenu is the desktop trigger (hidden md:block). Run once, on the
    // desktop project — the mobile project would force 1280px onto Pixel 5, a
    // semantically-misplaced duplicate (mirrors specs 19/20).
    test.skip(testInfo.project.name !== "desktop", "desktop UserMenu — desktop-project-only");
    await page.goto("/");
    await page.locator(accountTrigger).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // MEH-1310: favorites row now sits between profile and settings for every
    // logged-in role → producer order is dashboard → profile → מועדפים → הגדרות.
    const items = menu.getByRole("menuitem");
    await expect(items.nth(0)).toHaveText("לוח הבקרה שלי");
    await expect(items.nth(1)).toHaveText("הפרופיל שלי");
    await expect(items.nth(2)).toHaveText("מועדפים");
    await expect(items.nth(3)).toHaveText("הגדרות");

    await expect(menu.getByRole("menuitem", { name: "לוח הבקרה שלי" })).toHaveAttribute(
      "href",
      "/producer/dashboard",
    );
    // Public business page — a real producer UUID, never /producer/undefined.
    await expect(menu.getByRole("menuitem", { name: "הפרופיל שלי" })).toHaveAttribute(
      "href",
      /^\/producer\/[0-9a-f-]{36}$/,
    );
    // MEH-1310: favorites links to /favorites (shared with the mobile AccountSheet).
    await expect(menu.getByRole("menuitem", { name: "מועדפים" })).toHaveAttribute(
      "href",
      "/favorites",
    );
    await expect(menu.getByRole("menuitem", { name: "הגדרות" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

test.describe("consumer account menu — desktop (MEH-1226)", () => {
  test.skip(isLocal || !fs.existsSync(consumerAuth), skipReason);
  test.use({ storageState: consumerAuth, viewport: { width: 1280, height: 900 } });

  test("favorites → settings → logout; no profile / dashboard row", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop UserMenu — desktop-project-only");
    await page.goto("/");
    await page.locator(accountTrigger).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    await expect(menu.getByText("הפרופיל שלי")).toHaveCount(0);
    await expect(menu.getByText("לוח הבקרה שלי")).toHaveCount(0);
    // MEH-1310: consumers now have a favorites row → /favorites (was orphaned
    // on desktop pre-1310; the mobile AccountSheet always had it).
    await expect(menu.getByRole("menuitem", { name: "מועדפים" })).toHaveAttribute(
      "href",
      "/favorites",
    );
    await expect(menu.getByRole("menuitem", { name: "הגדרות" })).toHaveAttribute(
      "href",
      "/settings",
    );
    // Order: favorites sits above settings.
    const items = menu.getByRole("menuitem");
    await expect(items.nth(0)).toHaveText("מועדפים");
    await expect(items.nth(1)).toHaveText("הגדרות");
    // Exactly three menuitems: favorites (link) + settings (link) + logout (button).
    await expect(menu.getByRole("menuitem")).toHaveCount(3);
  });
});

test.describe("producer AccountSheet — mobile 375px (MEH-1228)", () => {
  test.skip(isLocal || !fs.existsSync(producerAuth), skipReason);
  test.use({ storageState: producerAuth, viewport: { width: 375, height: 812 } });

  test("first sheet row = לוח הבקרה שלי → /producer/dashboard", async ({ page }, testInfo) => {
    // AccountSheet's trigger is the BottomNav account tab (md:hidden). Run once,
    // on the mobile project (Pixel 5) — the desktop project would force 375px
    // onto a non-touch Desktop Chrome, a semantically-misplaced duplicate.
    test.skip(testInfo.project.name !== "mobile", "mobile AccountSheet — mobile-project-only");
    await page.goto("/");
    await page.locator(accountTrigger).click();
    // Scope by aria-label: CookieBanner is ALSO role="dialog" (aria-label
    // "הסכמה לעוגיות", z-[1100]) so a bare getByRole("dialog") is strict-mode
    // ambiguous. The AccountSheet is aria-label "חשבון" (nav.account).
    const sheet = page.getByRole("dialog", { name: "חשבון" });
    await expect(sheet).toBeVisible();

    await expect(sheet.getByRole("link", { name: "לוח הבקרה שלי" })).toHaveAttribute(
      "href",
      "/producer/dashboard",
    );
    // First row of the sheet (above favorites).
    await expect(sheet.getByRole("link").first()).toHaveText("לוח הבקרה שלי");
    // MEH-1310 regression guard: the mobile sheet's favorites row is UNTOUCHED
    // by the desktop-only Header change — it must still link /favorites.
    await expect(sheet.getByRole("link", { name: "מועדפים" })).toHaveAttribute(
      "href",
      "/favorites",
    );
  });
});
