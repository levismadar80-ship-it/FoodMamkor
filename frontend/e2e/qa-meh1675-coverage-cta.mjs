/**
 * MEH-1675 self-QA harness — "לא מגיעים ל{עיר}?" coverage-request CTA.
 * The CTA lives on the DeliveryChecker's negative verdict; `user_city` seeds
 * the checker so the "no" state is reached with zero typing.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1675-coverage-cta.mjs [baseURL] [chromiumPath]
 * The backend is unreachable from the CC sandbox, so the producer API is
 * intercepted at the Playwright layer and served a fixture. `user_city` is
 * seeded into localStorage per case — that is the input the CTA gates on.
 * REUSES: frontend/e2e/qa-meh1646-deliveryblock.mjs (fixture-intercept pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1675", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const producer = {
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
  pickup_points: false,
  order_window: null,
  locations: [],
  // City-only rows → the MEH-1435 CompactCities list, the densest case for
  // "my city isn't in this list".
  delivery_areas: [
    { id: 1, city: "חיפה" },
    { id: 2, city: "עתלית" },
    { id: 3, city: "זכרון יעקב" },
  ],
};

const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });

async function shot(name, viewport, userCity) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.addInitScript((city) => {
    if (city) localStorage.setItem("user_city", city);
    else localStorage.removeItem("user_city");
  }, userCity);
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/producers\/123$/.test(url)) return route.fulfill({ json: producer });
    if (/\/api\/producers(\?|$)/.test(url)) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${BASE}/producer/123`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);

  const cta = page.getByTestId("coverage-request-cta");
  const count = await cta.count();
  const text = count ? await cta.first().textContent() : "ABSENT";
  const href = await page
    .getByTestId("coverage-request-link")
    .getAttribute("href")
    .catch(() => null);
  const verdict = await page
    .getByTestId("delivery-checker-result")
    .getAttribute("data-result")
    .catch(() => null);
  console.log(`${name} | user_city=${userCity ?? "(none)"} | verdict=${verdict} | blocks=${count}`);
  console.log(`   text: ${JSON.stringify(text)}`);
  console.log(`   href: ${href ? decodeURIComponent(href) : "(none)"}`);

  const section = page.locator("section", { hasText: "משלוחים" }).last();
  await section.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

// (א) saved city NOT served → checker seeds, answers "no", CTA present.
await shot("coverage-cta-375-uncovered", { width: 375, height: 812 }, "נתניה");
await shot("coverage-cta-1440-uncovered", { width: 1440, height: 900 }, "נתניה");
// (ב) saved city IS served → checker answers "yes", CTA absent.
await shot("coverage-cta-375-covered", { width: 375, height: 812 }, "חיפה");
await shot("coverage-cta-1440-covered", { width: 1440, height: 900 }, "חיפה");
// no saved city → no seed, no verdict, no CTA (the known gap is only that
// she must type; the checker itself is unchanged from MEH-1536).
await shot("coverage-cta-375-nocity", { width: 375, height: 812 }, null);

await browser.close();
