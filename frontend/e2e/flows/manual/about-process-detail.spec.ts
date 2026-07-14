import { test, expect } from "@playwright/test";

/**
 * Spec:     manual/about-process-detail
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "MEH-534 /about/process
 *           תהליך הקבלה" — the content-detail rows (items 3/5/6/7/8/11) that
 *           manual/content-pages.spec.ts (items 1/2/4/9) did not cover: the
 *           4-step list, the badge section, the two category matrix groups, the
 *           closing quote, and the /about → /about/process cross-link.
 * Touches:  static SSG route only — no API.
 * Does NOT: assert item 12 (RTL / no-360px-overflow / tap-target sizes — VRT +
 *           layout territory) or the LTR badge-tooltip date (device/hover).
 * History:  MEH-1171 (creation).
 */

const initConsent = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));

// the page renders its steps/sections twice (responsive mobile-list + desktop-
// grid twins, one visible per breakpoint) — scope every text assertion to the
// visible instance
const vtext = (page: import("@playwright/test").Page, s: string) =>
  page.getByText(s, { exact: false }).locator("visible=true").first();

test.describe("/about/process content detail (MEH-1171 § MEH-534)", () => {
  // MANUAL_TESTING § MEH-534 item 3 — the 4 acceptance steps render (titles)
  test("the 4 acceptance-process steps render their titles", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    for (const title of [
      "הבקשה מגיעה אלינו",
      "מדברות, באמת",
      "ביקור, אם צריך",
      "עלייה לאתר — אחרי שהכרנו",
    ]) {
      await expect(vtext(page, title)).toBeVisible({ timeout: 15_000 });
    }
  });

  // MANUAL_TESTING § MEH-534 item 5 — the badge section's "no verified badge?"
  // block (badge.absence_h3). Note: the `badge.h2` key exists in he.json but is
  // NOT rendered (dead key — the section heading is badge.marker + oneliner);
  // the checklist itself points at this absence block, which IS shipped.
  test("the verified-badge section renders the absence block", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    await expect(vtext(page, "אין תג מאומת? זה לא אומר פחות")).toBeVisible({ timeout: 15_000 });
  });

  // MANUAL_TESTING § MEH-534 items 6 + 7 — the category matrix's two group titles
  test("the category matrix shows both licence group headings", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    await expect(vtext(page, "קטגוריות שבהן הדין מחייב רישיון")).toBeVisible();
    await expect(vtext(page, "קטגוריות פטורות מרישיון לפי החוק")).toBeVisible();
  });

  // MANUAL_TESTING § MEH-534 item 8 — the closing Sapir quote + attribution
  test("the closing quote and attribution render", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    await expect(vtext(page, "אני רוצה לדעת ממי אני קונה")).toBeVisible({ timeout: 15_000 });
    await expect(vtext(page, "— ספיר")).toBeVisible();
  });

  // MANUAL_TESTING § MEH-534 item 11 — /about cross-links to /about/process
  // (doc-stale: the checklist's "מכירות" is now "בודקות" in the shipped copy)
  test("/about cross-links to the acceptance-process page", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about");
    const link = page.getByRole("link", { name: "כך אנחנו בודקות כל בית עסק" });
    await expect(link).toHaveAttribute("href", /\/about\/process$/);
  });
});
