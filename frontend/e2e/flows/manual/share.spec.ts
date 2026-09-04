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
 * Locators: `getByTestId` only (docs/E2E-LOCATORS.md). The four actions ship
 *           `share-whatsapp` / `share-copy` / `share-native` / `share-email`
 *           (frontend/app/[locale]/share/ShareClient.jsx).
 * Copy:     expected strings come from messages/he.json (`share_page.*`), so
 *           a copy edit moves the expectation with it instead of reddening
 *           the spec — the reason the locator rule exists, applied to
 *           assertions too. The site URL is not imported: NEXT_PUBLIC_SITE_URL
 *           is baked in at build time and differs per target, so it is READ
 *           OFF THE PAGE (the WhatsApp message ends with it) and every other
 *           action is checked against that same value.
 * Does NOT: assert the h1 / intro / "no donation element" half of item 1 or
 *           the toast half of items 3-4 — neither the heading nor the toast
 *           message carries a testid, and this run adds none (MEH-1249
 *           ground rule: zero app edits). Recorded as residuals in
 *           docs/qa/conversion-progress.md, not silently dropped.
 *           Item 6 (footer link → /share) is not here: it is COVERED at
 *           component level by frontend/__tests__/FooterNavGroups.test.jsx:61
 *           (href list of the discover group includes "/share"), and the
 *           footer nav link carries no testid for a PW-level assertion.
 * Related:  frontend/e2e/flows/04-whatsapp-click.spec.ts (wa.me href
 *           pattern), frontend/__tests__/ShareClientEmailFallback.test.jsx
 *           (the silent-mailto fallback, vitest), docs/qa/conversion-page-map.md.
 * History:  MEH-1249 chunk 1 (creation, 04/09).
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

/** The site URL the page itself advertises — the WhatsApp message ends with it. */
async function advertisedSiteUrl(page: Page): Promise<string> {
  const href = await scope(page).getByTestId("share-whatsapp").getAttribute("href");
  expect(href, "share-whatsapp must carry an href before it can be parsed").toBeTruthy();
  const text = new URL(href ?? "").searchParams.get("text") ?? "";
  const m = text.match(/(https?:\/\/\S+)$/);
  expect(m, `WhatsApp message must end with the site URL, got: ${text}`).not.toBeNull();
  return m![1];
}

function expectedMessage(siteUrl: string): string {
  return COPY.message.replace("{url}", siteUrl);
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText().catch(() => "<clipboard read failed>"));
}

test.describe("manual › /share (MEH-1160)", () => {
  // MT:MEH-1160:1 — /share loads with the four share actions (WhatsApp, copy link, more ways, email).
  test("loads with exactly four share actions", async ({ page }) => {
    await page.goto("/share");
    // Count gate first (retries; the strict visibility check below would throw
    // instead of waiting if a stray copy ever landed INSIDE the landmark).
    await expect(scope(page).getByTestId("share-whatsapp")).toHaveCount(1, FIRST_PAINT);
    await expect(scope(page).getByTestId("share-whatsapp")).toBeVisible(FIRST_PAINT);
    for (const id of ["share-whatsapp", "share-copy", "share-native", "share-email"]) {
      // toHaveCount(1) and not just visible: a duplicated action row (the
      // shape an earlier draft of this page had) must fail here, not pass.
      await expect(scope(page).getByTestId(id)).toHaveCount(1);
      await expect(scope(page).getByTestId(id)).toBeVisible();
    }
  });

  // MT:MEH-1160:2 — "שתפו בוואטסאפ" opens WhatsApp with the prepared message that ends in the site link.
  test("WhatsApp action is a wa.me link carrying the full share message", async ({ page }) => {
    await page.goto("/share");
    const wa = scope(page).getByTestId("share-whatsapp");
    await expect(wa).toBeVisible(FIRST_PAINT);
    const href = (await wa.getAttribute("href")) ?? "";
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const siteUrl = await advertisedSiteUrl(page);
    expect(new URL(href).searchParams.get("text")).toBe(expectedMessage(siteUrl));
    await expect(wa).toHaveAttribute("target", "_blank");
  });

  // MT:MEH-1160:3 — "העתיקו קישור" copies the site URL (paste shows the site address).
  test("copy link puts the site URL on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/share");
    await expect(scope(page).getByTestId("share-copy")).toBeVisible(FIRST_PAINT);
    const siteUrl = await advertisedSiteUrl(page);
    await scope(page).getByTestId("share-copy").click();
    await expect.poll(() => readClipboard(page)).toBe(siteUrl);
  });

  // MT:MEH-1160:4 — "עוד דרכים לשתף" with a native share sheet: the payload handed to navigator.share.
  test("more-ways action hands title/text/url to navigator.share when it exists", async ({ page }) => {
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
    await page.goto("/share");
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

  // MT:MEH-1160:4 — "עוד דרכים לשתף" without native share (desktop): falls back to copying the link.
  test("more-ways action falls back to copying the site URL when navigator.share is absent", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });
    await page.goto("/share");
    await expect(scope(page).getByTestId("share-native")).toBeVisible(FIRST_PAINT);
    const siteUrl = await advertisedSiteUrl(page);
    await scope(page).getByTestId("share-native").click();
    await expect.poll(() => readClipboard(page)).toBe(siteUrl);
  });

  // MT:MEH-1160:5 — "שתפו במייל" opens the mail app with the subject "מכירים את מהמקור?" and the prepared body.
  test("email action is a mailto with the expected subject and body", async ({ page }) => {
    await page.goto("/share");
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
