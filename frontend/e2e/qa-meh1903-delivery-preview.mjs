/**
 * MEH-1903 self-QA harness — AREA_PREVIEW_LIMIT=6 on the editorial delivery
 * rows (hoist/flat/group) + PICKUP_PREVIEW_LIMIT 5→3.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1903-delivery-preview.mjs [baseURL] [chromiumPath]
 * The backend is unreachable from the CC sandbox (CLAUDE.md "Known Bug
 * Patterns" — *.up.railway.app egress is blocked), so the producer API is
 * intercepted at the Playwright layer and served a fixture.
 * REUSES: frontend/e2e/qa-meh1646-deliveryblock.mjs (manual QA-harness pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1903", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const baseProducer = {
  id: 123,
  name: "חוות הזית",
  slug: null,
  description: "שמן זית ומוצרי בוטיק מהחווה",
  city: "עתלית",
  phone: "0501234567",
  categories: [],
  images: [],
  is_approved: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_excluded_cities: [],
  pickup_points: true,
  locations: [],
  delivery_areas: [],
};

// (a) under the cap — 3 area rows, 0 pickup rows → must render NO toggle at all.
const underCap = {
  ...baseProducer,
  pickup_points: false,
  delivery_areas: [
    { id: 1, city: "זכרון יעקב", min_order: 100, delivery_day: "שישי" },
    { id: 2, city: "עתלית", min_order: 120, delivery_day: "שישי" },
    { id: 3, city: "בנימינה", min_order: 90, delivery_day: "שישי" },
  ],
};

// (b) the זכרון-יעקב demo shape — 9 hoist area rows over 3 days + 6 pickup
// points, i.e. both caps engaged at once (6 of 9 rows, 3 of 6 pickup rows).
const demo = {
  ...baseProducer,
  locations: [
    { kind: "pickup", label: "החווה", city: "זכרון יעקב", lat: 32.57, lng: 34.95, opening_hours: "שישי 8-13" },
    { kind: "market_stand", label: "דוכן שוק תלפיות", city: "חיפה", lat: 32.81, lng: 34.99 },
    { kind: "pickup", label: "נקודת איסוף מרכז", city: "בנימינה", lat: 32.51, lng: 34.94 },
    { kind: "pickup", label: "נקודת איסוף צפון", city: "עתלית", lat: 32.7, lng: 34.94 },
    { kind: "market_stand", label: "יריד אורגני", city: "פרדס חנה", lat: 32.47, lng: 34.97 },
    { kind: "pickup", label: "נקודת איסוף דרום", city: "חדרה", lat: 32.43, lng: 34.92 },
  ],
  delivery_areas: [
    { id: 1, city: "זכרון יעקב", min_order: 100, delivery_day: "שישי" },
    { id: 2, city: "בנימינה", min_order: 100, delivery_day: "שישי" },
    { id: 3, city: "עתלית", min_order: 120, delivery_day: "שישי" },
    { id: 4, city: "פרדס חנה", min_order: 120, delivery_day: "שישי" },
    { id: 5, city: "חיפה", min_order: 150, delivery_day: "שלישי" },
    { id: 6, city: "עכו", min_order: 150, delivery_day: "שלישי" },
    { id: 7, city: "נהריה", min_order: 180, delivery_day: "שלישי" },
    { id: 8, city: "כרמיאל", min_order: 200, delivery_day: "רביעי" },
    { id: 9, city: "צפת", min_order: 200, delivery_day: "רביעי" },
  ],
};

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

async function shot(name, viewport, producer, { expand = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/producers\/123$/.test(url)) return route.fulfill({ json: producer });
    if (/\/api\/producers(\?|$)/.test(url)) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${BASE}/producer/123`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);

  // The cookie banner is fixed to the bottom and covers the block being
  // reviewed — dismiss it so the screenshot shows the subject, not the banner.
  await page
    .getByRole("button", { name: "קבלו הכל" })
    .click({ timeout: 2000 })
    .catch(() => {});
  await page.waitForTimeout(300);

  const section = page.locator("section").filter({ hasText: "משלוחים" }).last();
  await section.scrollIntoViewIfNeeded().catch(() => {});

  if (expand) {
    // Expand EVERY disclosure in the delivery section (area cap + pickup cap).
    const toggles = section.locator("button[aria-expanded]");
    const n = await toggles.count();
    for (let i = 0; i < n; i++) await toggles.nth(i).click().catch(() => {});
    await page.waitForTimeout(400);
  }

  // Numeric receipts printed next to every shot, so the screenshot is never the
  // only evidence (a green picture and a green count can disagree).
  const areaRows = await section.locator("ul li").count();
  const toggleCount = await section.locator("button[aria-expanded]").count();
  const toggleLabels = await section.locator("button[aria-expanded]").allInnerTexts();
  console.log(
    `${name}: li=${areaRows} toggles=${toggleCount} labels=${JSON.stringify(toggleLabels)}`,
  );

  // Clip to the section's box intersected with the document width — an element
  // screenshot alone came back horizontally clipped on the 375 run (the RTL
  // section box overhangs the viewport), which hid the row text being reviewed.
  // A fullPage clip is in DOCUMENT coordinates, while boundingBox() returns
  // VIEWPORT-relative ones — mixing the two put the first run's clip window
  // hundreds of px above the block. Read the document offset directly.
  const box = await section.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  });
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: {
      x: 0,
      y: Math.max(0, box.top - 8),
      width: viewport.width,
      height: Math.min(box.height + 16, 2400),
    },
    fullPage: true,
  });
  await ctx.close();
}

const M = { width: 375, height: 851 };
const D = { width: 1440, height: 900 };

await shot("a-under-cap-3rows-375", M, underCap);
await shot("a-under-cap-3rows-1440", D, underCap);
await shot("b-demo-collapsed-375", M, demo);
await shot("b-demo-collapsed-1440", D, demo);
await shot("c-demo-expanded-375", M, demo, { expand: true });
await shot("c-demo-expanded-1440", D, demo, { expand: true });

await browser.close();
console.log("screenshots →", OUT);
