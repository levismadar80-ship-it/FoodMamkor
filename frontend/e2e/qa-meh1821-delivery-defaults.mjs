/**
 * MEH-1821 self-QA harness — dashboard DeliveryCard defaults-first ordering.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1821-delivery-defaults.mjs [baseURL] [chromiumPath]
 * Auth + profile APIs are intercepted (backend unreachable from the CC
 * sandbox): a fake token in localStorage + fixture /auth/me + /producers/me.
 * REUSES: frontend/e2e/qa-meh1644-delivery-day-select.mjs (same card, same
 * fixture-intercept pattern).
 *
 * The fixture deliberately carries all three per-city fee states so one
 * screenshot shows the whole matrix: null (inherits), 0 (free), positive
 * (its own rate). It also asserts DOM order numerically rather than trusting
 * the eye — a screenshot of a scrolled card can hide which block came first.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3102";
const OUT = new URL("../../qa-artifacts/MEH-1821", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const user = { id: "u1", name: "ספיר", email: "owner@example.com", role: "producer", producer_id: "p1" };

const profile = {
  id: "p1", name: "חוות הזית", slug: null, status: "approved",
  description: "", short_description: "", city: "עתלית", address: null, phone: "0501234567",
  has_physical_location: true, offers_delivery: true, delivery_nationwide: false,
  delivery_excluded_cities: [], pickup_points: false,
  // MEH-1577 business-level default the rows below inherit from.
  delivery_fee: 35, free_delivery_above: 250,
  delivery_areas: [
    { city: "חיפה", delivery_day: "שישי", min_order: 100, delivery_fee: null }, // inherits 35
    { city: "עכו", delivery_day: null, delivery_fee: 0 }, // free for this city
    { city: "נהריה", delivery_day: null, delivery_fee: 20 }, // its own rate
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
  await page.getByText("מיקום, משלוחים ושעות").first().click().catch(() => {});
  await page.waitForTimeout(400);
  const deliveryHeading = page.getByText("משלוחים ואיסוף").first();
  if (await deliveryHeading.count()) await deliveryHeading.click().catch(() => {});
  await page.waitForTimeout(600);

  const block = page.getByTestId("delivery-default-block");
  await block.scrollIntoViewIfNeeded().catch(() => {});
  // Numeric DOM-order check: 4 === DOCUMENT_POSITION_FOLLOWING (row after block).
  const order = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="delivery-default-block"]');
    const r = document.querySelector('[data-testid="delivery-fee-input-חיפה"]');
    if (!b || !r) return `MISSING block=${!!b} row=${!!r}`;
    return b.compareDocumentPosition(r) & 4 ? "block-BEFORE-areas OK" : "WRONG ORDER";
  });
  const hint = async (c) =>
    (await page.getByTestId(`delivery-fee-hint-${c}`).textContent().catch(() => null)) ?? "(none)";
  console.log(
    name, "|", order,
    "| חיפה(null):", await hint("חיפה"),
    "| עכו(0):", await hint("עכו"),
    "| נהריה(20):", await hint("נהריה"),
  );
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  // Second frame scrolled onto the area list — the hints are the deliverable
  // and the first frame cuts them off below the fold. Cookie banner dismissed
  // so it can't sit on top of the rows being reviewed.
  await page.getByRole("button", { name: "קבלו הכל" }).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByTestId("delivery-fee-hint-עכו").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-areas.png`, fullPage: false });
  await ctx.close();
}

await shot("delivery-card-375", { width: 375, height: 812 });
await shot("delivery-card-1440", { width: 1440, height: 900 });

await browser.close();
