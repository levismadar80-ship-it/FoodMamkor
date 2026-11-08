import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";

/**
 * Spec:     manual/share
 * Purpose:  docs/MANUAL_TESTING.md § `MEH-1160 — דף /share "ספרו עלינו"`,
 *           converted under MEH-1249 stage 2 (chunk 1 — one page per PR).
 *           Every test carries `// MT:MEH-1160:<n>` — the matrix row it
 *           discharges (docs/qa/manual-testing-matrix.md, all six rows
 *           CONVERT-PW, destructive = no).
 * Touches:  a static SSG route only — no API writes, no auth. Clipboard
 *           permissions are granted where an item asserts what was copied;
 *           `navigator.share` is stubbed (addInitScript) in both directions
 *           for item 4, because the OS share sheet is device-only.
 * Locators: `getByTestId` only (docs/E2E-LOCATORS.md). Since MEH-2827 PR 5
 *           /share 308s to /recommend#share, and the section ships THREE
 *           actions — `share-native` («שתפו», the phone's own share sheet),
 *           `share-copy`, `share-email` (components/ShareSiteActions.jsx).
 *           There is no WhatsApp-only action any more (Sapir 08/11).
 * Copy:     expected strings come from messages/he.json (`share_page.*`), so
 *           a copy edit moves the expectation with it instead of reddening
 *           the spec — the reason the locator rule exists, applied to
 *           assertions too. The site URL is not imported: NEXT_PUBLIC_SITE_URL
 *           is baked in at build time and differs per target, so it is READ
 *           OFF THE PAGE (the email body ends with it) and every other
 *           action is checked against that same value.
 * Does NOT: assert the h1 / intro / "no donation element" half of item 1 or
 *           the toast half of items 3-4 — neither the heading nor the toast
 *           message carries a testid, and this run adds none (MEH-1249
 *           ground rule: zero app edits). Recorded as residuals in
 *           docs/qa/conversion-progress.md, not silently dropped.
 *           Item 6 (footer link → /recommend#share) is not here: it is COVERED at
 *           component level by frontend/__tests__/FooterNavGroups.test.jsx:61
 *           (href list of the discover group includes "/recommend#share"), and the
 *           footer nav link carries no testid for a PW-level assertion.
 * Related:  frontend/e2e/flows/04-whatsapp-click.spec.ts (wa.me href
 *           pattern), frontend/__tests__/ShareClientEmailFallback.test.jsx
 *           (the silent-mailto fallback, vitest), docs/qa/conversion-page-map.md.
 * History:  MEH-1249 chunk 1 (creation, 04/09) · MEH-2827 PR 5 (/share →
 *           /recommend#share; one «שתפו» replaces WhatsApp + «עוד דרכים לשתף»).
 */

const COPY = he.share_page;
const FIRST_PAINT = { timeout: 15_000 };

// MEH-1792 (re-measured 2026-09-04 on this spec): during the app's page-transition
// window a second copy of the page tree exists briefly OUTSIDE `#main-content`,
// so a page-wide `getByTestId` can resolve to TWO elements and fail strict mode
// ("resolved to 2 elements … unexpected value hidden") — seen on the mobile
// project in both a red-control run and a green run. Scoping every locator to
// the `#main-content` landmark (layout.js) names the live tree only. Same fix
// as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
const scope = (page: Page) => page.locator("#main-content");

/** The site URL the page itself advertises — the email body ends with it. */
async function advertisedSiteUrl(page: Page): Promise<string> {
  const href = await scope(page).getByTestId("share-email").getAttribute("href");
  expect(href, "share-email must carry an href before it can be parsed").toBeTruthy();
  const raw = href ?? "";
  const body = new URLSearchParams(raw.slice(raw.indexOf("?") + 1)).get("body") ?? "";
  const m = body.match(/(https?:\/\/\S+)$/);
  expect(m, `the email body must end with the site URL, got: ${body}`).not.toBeNull();
  return m![1];
}

function expectedMessage(siteUrl: string): string {
  return COPY.message.replace("{url}", siteUrl);
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText().catch(() => "<clipboard read failed>"));
}

test.describe("manual › /share → /recommend#share (MEH-1160 · MEH-2827)", () => {
  // MT:MEH-1160:1 — the old /share link still works and lands on the share section.
  test("/share redirects to /recommend#share with exactly three share actions", async ({ page }) => {
    await page.goto("/share");
    await expect(page).toHaveURL(/\/recommend#share$/, FIRST_PAINT);
    await expect(scope(page).getByTestId("recommend-share")).toBeVisible(FIRST_PAINT);
    for (const id of ["share-native", "share-copy", "share-email"]) {
      // toHaveCount(1) and not just visible: a duplicated action row must fail here.
      await expect(scope(page).getByTestId(id)).toHaveCount(1);
      await expect(scope(page).getByTestId(id)).toBeVisible();
    }
    // Sapir 08/11: no WhatsApp-only share button anywhere.
    await expect(scope(page).getByTestId("share-whatsapp")).toHaveCount(0);
    await expect(scope(page).locator('[data-testid="recommend-share"] a[href*="wa.me"]')).toHaveCount(0);
  });

  // MT:MEH-1160:3 — "העתיקו קישור" copies the site URL (paste shows the site address).
  test("copy link puts the site URL on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/recommend#share");
    await expect(scope(page).getByTestId("share-copy")).toBeVisible(FIRST_PAINT);
    const siteUrl = await advertisedSiteUrl(page);
    await scope(page).getByTestId("share-copy").click();
    await expect.poll(() => readClipboard(page)).toBe(siteUrl);
  });

  // MT:MEH-1160:4 — «שתפו» with a native share sheet: the payload handed to navigator.share.
  test("«שתפו» hands title/text/url to navigator.share when it exists", async ({ page }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      (window as unknown as { __shareCalls: unknown[] }).__shareCalls = calls;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (data: unknown) => {
          calls.push(data);
          return Promise.resolve();
        },
      });
    });
    await page.goto("/recommend#share");
    await expect(scope(page).getByTestId("share-native")).toBeVisible(FIRST_PAINT);
    const siteUrl = await advertisedSiteUrl(page);
    await scope(page).getByTestId("share-native").click();
    const calls = () =>
      page.evaluate(() => (window as unknown as { __shareCalls: unknown[] }).__shareCalls);
    await expect.poll(async () => (await calls()).length).toBe(1);
    const [payload] = (await calls()) as Array<{ title?: string; text?: string; url?: string }>;
    expect(payload.url).toBe(siteUrl);
    expect(payload.text).toBe(expectedMessage(siteUrl));
    expect(typeof payload.title).toBe("string");
    expect(payload.title?.length ?? 0).toBeGreaterThan(0);
  });

  // MT:MEH-1160:4 — «שתפו» without native share (desktop): falls back to copying the link.
  test("«שתפו» falls back to copying the site URL when navigator.share is absent", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });
    await page.goto("/recommend#share");
    await expect(scope(page).getByTestId("share-native")).toBeVisible(FIRST_PAINT);
    const siteUrl = await advertisedSiteUrl(page);
    await scope(page).getByTestId("share-native").click();
    await expect.poll(() => readClipboard(page)).toBe(siteUrl);
  });

  // MT:MEH-1160:5 — "שתפו במייל" opens the mail app with the subject "מכירים את מהמקור?" and the prepared body.
  test("email action is a mailto with the expected subject and body", async ({ page }) => {
    await page.goto("/recommend#share");
    const mail = scope(page).getByTestId("share-email");
    await expect(mail).toBeVisible(FIRST_PAINT);
    const href = (await mail.getAttribute("href")) ?? "";
    expect(href).toMatch(/^mailto:\?/);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    const siteUrl = await advertisedSiteUrl(page);
    expect(params.get("subject")).toBe(COPY.email_subject);
    expect(params.get("body")).toBe(expectedMessage(siteUrl));
  });
});
