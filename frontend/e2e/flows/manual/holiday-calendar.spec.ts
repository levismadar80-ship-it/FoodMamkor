import { test, expect } from "../_cloudinary-stub";

/**
 * Spec:     manual/holiday-calendar
 * Purpose:  MEH-3017 — lib/hebrew-holidays.js finds each holiday by the
 *           English month name the built-in Intl Hebrew calendar prints
 *           ("Tishri", "Kislev", "Shevat", "Nisan", "Sivan"). vitest covers
 *           Node's ICU only; Safari uses Apple's own ICU. If a browser named a
 *           month differently, the banner would go silent with no error (the
 *           MEH-2998 failure). This runs the same Intl call in each browser
 *           project, so the WebKit run is the Safari check.
 * Touches:  nothing — no page, no backend; an in-browser Intl call only.
 */

// Days whose Hebrew date is known independently (5788 — see holidays.test.js).
const ANCHORS: Array<[string, string]> = [
  ["2027-10-02", "1 Tishri 5788"],
  ["2027-12-25", "25 Kislev 5788"],
  ["2028-02-12", "15 Shevat 5788"],
  ["2028-04-11", "15 Nisan 5788"],
  ["2028-05-31", "6 Sivan 5788"],
];

test("the browser's Hebrew calendar names the months the holiday rules use", async ({ page }) => {
  await page.goto("about:blank");
  const got = await page.evaluate((days) => {
    const f = new Intl.DateTimeFormat("en-u-ca-hebrew", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return days.map((d) => {
      const parts: Record<string, string> = {};
      for (const p of f.formatToParts(new Date(`${d}T00:00:00Z`))) parts[p.type] = p.value;
      return `${parts.day} ${parts.month} ${parts.year}`;
    });
  }, ANCHORS.map(([d]) => d));
  expect(got).toEqual(ANCHORS.map(([, h]) => h));
});
