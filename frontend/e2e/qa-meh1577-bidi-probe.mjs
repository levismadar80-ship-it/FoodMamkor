/**
 * MEH-1577 bidi probe (NOT part of the e2e suite — run manually):
 *   node e2e/qa-meh1577-bidi-probe.mjs [baseURL] [chromiumPath]
 *
 * Question: does <bdi>{formatPrice(x)}</bdi> in the new fee line render the ₪
 * amount the SAME WAY as the established `<span dir="ltr">` in AreaRow's
 * min_order (MEH-1168 P1 canon)? Rendering it differently would be a visible
 * inconsistency inside one block, and a 375px screenshot is too small to settle
 * it by eye — this measures the computed direction/isolation/width instead.
 *
 * Measured 2026-07-27, both elements holding the identical string "35₪":
 *   bdi  → dir=ltr, unicode-bidi=isolate, width=27
 *   span → dir=ltr, unicode-bidi=isolate, width=27
 * i.e. the two mechanisms are equivalent here (a `dir` attribute implies
 * isolation), so the fee line matches the canon. Kept because the claim is the
 * kind that rots silently: re-run it if either rendering path changes.
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:3100";
const producer = {
  id: 123,
  name: "חוות הזית",
  slug: null,
  city: "עתלית",
  phone: "0501234567",
  categories: [],
  images: [],
  is_approved: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_excluded_cities: [],
  pickup_points: false,
  order_window: null,
  locations: [],
  // min_order present => AreaRow renders its dir="ltr" span in the same block.
  delivery_areas: [{ id: 1, city: "זכרון יעקב", min_order: 35, delivery_day: "שישי" }],
  delivery_fee: 35,
  free_delivery_above: 250,
};

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he" });
const page = await ctx.newPage();
await page.route("**/api/**", (route) => {
  const url = route.request().url();
  if (/\/api\/producers\/123$/.test(url)) return route.fulfill({ json: producer });
  if (/\/api\/producers(\?|$)/.test(url)) return route.fulfill({ json: [] });
  return route.fulfill({ json: {} });
});
await page.goto(`${BASE}/producer/123`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(1200);

// Both amounts are the SAME string ("35₪"): one inside <bdi> (new fee line),
// one inside <span dir="ltr"> (AreaRow, the canon). Compare their rendered
// direction by measuring each element's own computed direction + text.
const result = await page.evaluate(() => {
  const read = (el) =>
    el && {
      tag: el.tagName,
      text: el.textContent,
      dir: getComputedStyle(el).direction,
      unicodeBidi: getComputedStyle(el).unicodeBidi,
      width: Math.round(el.getBoundingClientRect().width),
    };
  const feeBdi = document.querySelector('[data-testid="delivery-fee-line"] bdi');
  const areaSpan = document.querySelector('li span[dir="ltr"]');
  return { feeBdi: read(feeBdi), areaSpan: read(areaSpan) };
});
console.log(JSON.stringify(result, null, 2));

await browser.close();
