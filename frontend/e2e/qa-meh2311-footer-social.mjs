/**
 * MEH-2311 — footer social links, 375 + 1440 evidence (he + en).
 *
 * /api/* is answered in-page with empty bodies (the footer needs no data).
 * For each width it reads every outbound footer link: href, rendered box
 * (tap target >= 44x44) and whether the row stays on one line, then
 * screenshots the footer.
 *
 * Control (run first): the existing Instagram link must be found and
 * measured — if the probe cannot see that one, every other result is void.
 *
 * Usage: node e2e/qa-meh2311-footer-social.mjs [outDir] [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "../qa-artifacts/MEH-2311";
// REUSES: e2e/qa-meh2314-views-chart.mjs — argv override, no env read.
const BASE = process.argv[3] || "http://localhost:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium"; // the sandbox build; CI falls back to the default
const EXPECTED = [
  "https://www.instagram.com/meha_makor",
  "https://www.facebook.com/mehamakor",
  "https://www.tiktok.com/@mehamakor",
  "https://www.youtube.com/@Mehamakor",
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

for (const locale of ["he", "en"]) {
  for (const w of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 } });
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto(`${BASE}/${locale}/about`);
    const footer = page.locator("footer").last();
    await footer.waitFor({ timeout: 15_000 });
    // Dismiss the cookie banner so it does not cover the footer in the shot.
    await page.locator('button:has-text("קבלו הכל"), button:has-text("Accept all")').first().click({ timeout: 3_000 }).catch(() => {});
    await footer.scrollIntoViewIfNeeded();

    const links = await footer.evaluate((el) =>
      [...el.querySelectorAll('a[href^="https://"]')].map((a) => {
        const r = a.getBoundingClientRect();
        return { href: a.getAttribute("href"), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
      }),
    );
    const tag = `${locale} @${w}`;
    const ig = links.find((l) => l.href === EXPECTED[0]);
    if (!ig || ig.w === 0) {
      console.log(`CONTROL FAIL ${tag}: Instagram link not measured — results below are void`);
      failures++;
    }
    check(JSON.stringify(links.map((l) => l.href)) === JSON.stringify(EXPECTED), `${tag}: four profiles in order`);
    const icons = links.filter((l) => l.href !== EXPECTED[0]);
    check(icons.every((l) => l.w >= 44 && l.h >= 44), `${tag}: icon tap targets ${icons.map((l) => `${l.w}x${l.h}`).join(" ")}`);
    check(new Set(icons.map((l) => l.top)).size === 1, `${tag}: icon row on one line`);
    await footer.screenshot({ path: `${OUT}/footer-${locale}-${w}.png` });
    await ctx.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
