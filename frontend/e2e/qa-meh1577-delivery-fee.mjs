/**
 * MEH-1577 self-QA harness — DeliveryBlock structured delivery-cost line.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1577-delivery-fee.mjs [baseURL] [chromiumPath]
 * The backend is unreachable from the CC sandbox, so the producer API is
 * intercepted at the Playwright layer and served a fixture.
 * REUSES: frontend/e2e/qa-meh1646-deliveryblock.mjs (manual QA-harness pattern).
 *
 * Six states, matching the vitest cases 1:1. The sixth exists because neither
 * MEH-1577 nor MEH-1646 could see it alone: 1646 put a bare "חינם" tag on
 * pickup rows, and delivery_fee=0 puts "חינם" in the cost line. This harness
 * COUNTS the bare tags so the combined state is checked, not just eyeballed.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1577", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const base = {
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
  delivery_nationwide: true,
  delivery_excluded_cities: [],
  pickup_points: false,
  order_window: null,
  locations: [],
  delivery_areas: [],
  delivery_fee: null,
  free_delivery_above: null,
};

const withPickup = {
  locations: [
    { kind: "pickup", label: "החווה", city: "עתלית", lat: 32.7, lng: 34.94 },
  ],
};

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

async function shot(name, viewport, producer) {
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

  const feeLine = page.getByTestId("delivery-fee-line");
  const feeText = await feeLine.textContent().catch(() => "ABSENT");
  // Exact-match count of the BARE word — the fee line reads "משלוח חינם" and
  // must NOT join this set, or the block shows "חינם" twice unqualified.
  const bareFree = await page.getByText("חינם", { exact: true }).count();
  console.log(
    `${name.padEnd(34)} fee-line=${JSON.stringify(feeText)}  bare-חינם=${bareFree}`,
  );

  const section = page.locator("section", { hasText: "משלוחים" }).last();
  await section.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

const cases = [
  ["both", { delivery_fee: 35, free_delivery_above: 250 }],
  ["fee-only", { delivery_fee: 35 }],
  ["threshold-only", { free_delivery_above: 250 }],
  ["fee-zero", { delivery_fee: 0 }],
  ["none", {}],
  // The combined state (MEH-1577 × MEH-1646).
  ["fee-zero-with-pickup", { delivery_fee: 0, ...withPickup }],
];

for (const [name, patch] of cases) {
  for (const [w, h] of [
    [375, 812],
    [1440, 900],
  ]) {
    await shot(`${name}-${w}`, { width: w, height: h }, { ...base, ...patch });
  }
}

await browser.close();
