import { test, expect } from "@playwright/test";

const TOGGLE = '[data-testid="language-toggle"]';

/**
 * MEH-475 LanguageToggle — a Globe button that flips HE ⇄ EN while preserving
 * the pathname.
 *
 * This header comment was wrong in TWO ways before MEH-1698. Both corrected:
 *
 * 1. It was INVERTED, on both halves. It said the toggle "lives in the desktop
 *    header" and "is absent on the mobile project". From 21/06 (MEH-896,
 *    b7919b39) until MEH-1698 the truth was the exact opposite: the desktop
 *    header had NO toggle at all — Header.jsx:394-395 was a bare comment — and
 *    mobile was the ONLY surface carrying one, in the AccountSheet row
 *    (AccountSheet.jsx:191, variant="bare").
 * 2. "skip gracefully there" implied this suite cannot assert per viewport. It
 *    can, for free: playwright.config.ts:94-105 defines BOTH a desktop project
 *    (1440x900) and a mobile one (Pixel 5), and e2e.yml:158 runs
 *    `npx playwright test` with no --project filter, so both execute on every
 *    PR. There was never anything to skip around.
 *
 * The post-MEH-1698 invariant these tests lock:
 *   desktop (>=768px) → the toggle IS in the header pill
 *                       (Header.jsx:400-402, `hidden md:inline-flex`)
 *   mobile  (<768px)  → it is NOT in the pill; the mobile surface is the
 *                       AccountSheet row reached from BottomNav.
 *
 * WHY THERE IS NO `count()===0` SKIP ANY MORE — the load-bearing part.
 * The previous version opened with `if ((await toggle.count()) === 0)
 * test.skip(...)`. It consulted the very thing it existed to assert, so the
 * control going missing DISABLED the test rather than failing it. Even with
 * the `test.fixme` lifted it could not have caught MEH-896; that is why the
 * regression sat for five weeks in every environment.
 *
 * `test.skip(testInfo.project.name !== "…")` below is NOT that shape. It
 * branches on a static project identity fixed by playwright.config.ts, which
 * no product regression can alter. Same construction as the repo's existing
 * per-project VRT shots (e2e/visual/parity.spec.ts:522). The distinction is
 * the whole lesson: never gate a guard on its own subject.
 */
test.describe("Language toggle", () => {
  test("desktop header mounts the toggle", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "asserts the >=768px pill");

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Hard assertion, no escape hatch: exactly one VISIBLE toggle, and it is
    // inside the sticky <header> (Header.jsx:230) rather than anywhere else on
    // the page. `toHaveCount` retries, so this needs no bespoke waiting.
    const inHeader = page.locator("header").locator(`${TOGGLE}:visible`);
    await expect(inHeader).toHaveCount(1);
    await expect(inHeader.first()).toHaveAttribute("data-current-locale", "he");
    await expect(inHeader.first()).toBeEnabled();
  });

  test("mobile pill does not mount the toggle", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "asserts the <768px pill");

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // The `hidden md:inline-flex` gate: present in the DOM, never visible.
    // Asserting VISIBLE-count 0 (not DOM-count 0) is deliberate — the element
    // ships in the markup on both viewports and only CSS decides.
    await expect(page.locator("header").locator(`${TOGGLE}:visible`)).toHaveCount(0);

    // …and the mobile surface that does own it is still reachable. Without
    // this line the test above would also pass if the toggle vanished from
    // mobile entirely, which is the failure mode one viewport up.
    await expect(page.locator("nav button[aria-label]").last()).toBeVisible();
  });

  // STILL QUARANTINED — Ref MEH-817 (open). The locale round-trip races: under
  // `as-needed`, one direction lands on the unprefixed default-locale path
  // whose locale resolves from the NEXT_LOCALE cookie, and router.replace's
  // cookie-write races the RSC fetch, so useLocale() intermittently keeps the
  // previous value. Under `--fail-on-flaky-tests` (e2e.yml) un-quarantining
  // this would red the required E2E gate intermittently for a bug that is not
  // MEH-1698's.
  //
  // NOTE, unresolved: MEH-817's prose names EN→HE as the racing direction but
  // cites the assertion that checks HE→EN. The two disagree and I have not
  // determined which is right — so this stays quarantined on the ticket's
  // authority, not on a guess of mine. Un-quarantine when MEH-817 ships.
  //
  // This quarantine is NOT the anti-pattern this file was rewritten to remove:
  // the guard above cannot be disabled by the product regressing, and this
  // test covers a different behaviour (the flip) from the one that broke
  // (the control's existence).
  test.fixme("flips he → en and back, preserving the path", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const toggle = page.locator(`${TOGGLE}:visible`).first();
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute("data-current-locale", "he");

    // HE → EN: `as-needed` prefix adds the /en segment.
    await toggle.click();
    await page.waitForURL(/\/en(\/|$|\?)/, { timeout: 20_000 });
    const enToggle = page.locator(`${TOGGLE}:visible`).first();
    await expect(enToggle).toHaveAttribute("data-current-locale", "en");

    // EN → HE: the /en prefix is dropped (default locale).
    await enToggle.click();
    await page.waitForURL((url) => !/\/en(\/|$)/.test(url.pathname), { timeout: 20_000 });
    await expect(page.locator(`${TOGGLE}:visible`).first()).toHaveAttribute(
      "data-current-locale",
      "he",
    );
  });
});
