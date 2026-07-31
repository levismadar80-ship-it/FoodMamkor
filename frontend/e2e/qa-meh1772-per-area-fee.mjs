/**
 * MEH-1772 chunk 3 self-QA — mobile 375px, real components, stubbed API.
 *
 * Asserts the rendered STRINGS, not a screenshot: a green VRT would not catch
 * a wrong number (playwright.config maxDiffPixelRatio 0.02 ~ 6,688px on
 * mobile), and the whole feature is a number being right.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";
const VARIANCE = "/producer/11111111-1111-1111-1111-111111111111";
const UNIFORM = "/producer/22222222-2222-2222-2222-222222222222";

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
};

// The sandbox ships chromium-1194; this Playwright wants 1234. Point at the
// pre-installed binary rather than downloading (per the environment's note).
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

async function scrape(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const feeLine = await page
    .getByTestId("delivery-fee-line")
    .first()
    .textContent()
    .catch(() => null);
  const rows = await page.getByTestId("area-fee").allTextContents();
  // Row cities, to prove the fee lands on the right city and not just "a" row.
  const cities = await page
    .locator("li:has([data-testid='area-fee']) > span")
    .first()
    .textContent()
    .catch(() => null);
  return { feeLine: feeLine?.trim() ?? null, rows, firstCity: cities?.trim() };
}

// Capture the DELIVERY SECTION, not the viewport. A viewport shot at 375
// lands on the hero, which is identical for both fixtures — the first run of
// this script produced two byte-identical PNGs and would have "evidenced"
// nothing at all.
async function shotDelivery(file) {
  const section = page
    .locator("section", { has: page.getByTestId("delivery-fee-line") })
    .first();
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await section.screenshot({ path: file });
}

// ---- variance: two overrides + one inheriting row -------------------------
const v = await scrape(VARIANCE);
check(
  "variance · top line states the minimum with מ-",
  v.feeLine?.includes("משלוח מ-20₪"),
  `top line = ${JSON.stringify(v.feeLine)}`,
);
check(
  "variance · every area row carries its own effective fee (incl. the inherited 35)",
  JSON.stringify(v.rows) ===
    JSON.stringify(["משלוח: 20₪", "משלוח: 40₪", "משלוח: 35₪"]),
  `rows = ${JSON.stringify(v.rows)}`,
);
check(
  "variance · the inheriting row shows 35, so the fallback resolved client-side",
  v.rows.includes("משלוח: 35₪"),
  `ירושלים states no override; 35 is the business rate`,
);
check(
  "variance · the flat producer rate is NOT presented as the price",
  v.feeLine != null && !v.feeLine.includes("משלוח: 35₪"),
  `top line = ${JSON.stringify(v.feeLine)}`,
);

await shotDelivery("qa-variance-375.png");

// ---- uniform: the byte-identical control ---------------------------------
const u = await scrape(UNIFORM);
check(
  "uniform · top line is the flat rate, no מ-",
  u.feeLine?.includes("משלוח: 35₪") && !u.feeLine.includes("מ-"),
  `top line = ${JSON.stringify(u.feeLine)}`,
);
check(
  "uniform · NO per-row fee (render unchanged from before the ticket)",
  u.rows.length === 0,
  `rows = ${JSON.stringify(u.rows)}`,
);

await shotDelivery("qa-uniform-375.png");

// ---- RTL sanity: no horizontal overflow at 375 ----------------------------
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1,
);
check("no horizontal overflow at 375px", !overflow, `scrollWidth vs 375`);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
process.exit(failed.length ? 1 : 0);
