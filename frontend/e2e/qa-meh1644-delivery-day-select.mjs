/**
 * MEH-1644 self-QA harness — dashboard DeliveryCard per-city day select.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1644-delivery-day-select.mjs [baseURL] [chromiumPath]
 * Auth + profile APIs are intercepted (backend unreachable from the CC
 * sandbox): a fake token in localStorage + fixture /auth/me + /producers/me.
 * REUSES: frontend/e2e/qa-meh1646-deliveryblock.mjs (fixture-intercept pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3102";
const OUT = new URL("../../qa-artifacts/MEH-1644", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const user = { id: "u1", name: "ספיר", email: "owner@example.com", role: "producer", producer_id: "p1" };

const profile = {
  id: "p1", name: "חוות הזית", slug: null, status: "approved",
  description: "", short_description: "", city: "עתלית", address: null, phone: "0501234567",
  has_physical_location: true, offers_delivery: true, delivery_nationwide: false,
  delivery_excluded_cities: [], pickup_points: false,
  delivery_areas: [
    { city: "חיפה", delivery_day: "שישי", min_order: 100 },
    { city: "עכו", delivery_day: null },
    { city: "זכרון יעקב", delivery_day: "ימי שישי" }, // legacy free text → arranged option
  ],
  categories: [], products: [], images: [], custom_questions: [], locations: [],
  order_window: null, opening_hours: null, kosher: null, contact_name: null,
};

const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });

async function shot(name, viewport) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: user });
    if (url.pathname.endsWith("/producers/me")) return route.fulfill({ json: profile });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${BASE}/producer/dashboard/edit`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  // Open the "מיקום, משלוחים ושעות" group, then the delivery card inside it.
  await page.getByText("מיקום, משלוחים ושעות").first().click().catch(() => {});
  await page.waitForTimeout(400);
  const deliveryHeading = page.getByText("משלוחים ואיסוף").first();
  if (await deliveryHeading.count()) await deliveryHeading.click().catch(() => {});
  await page.waitForTimeout(600);
  const haifa = page.getByTestId("delivery-day-select-חיפה");
  await haifa.scrollIntoViewIfNeeded().catch(() => {});
  console.log(name, "חיפה:", await haifa.inputValue().catch(() => "MISSING"),
    "| עכו:", await page.getByTestId("delivery-day-select-עכו").inputValue().catch(() => "MISSING"),
    "| legacy זכרון:", await page.getByTestId("delivery-day-select-זכרון יעקב").inputValue().catch(() => "MISSING"));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

await shot("dashboard-375-day-select", { width: 375, height: 812 });
await shot("dashboard-1440-day-select", { width: 1440, height: 900 });

await browser.close();
