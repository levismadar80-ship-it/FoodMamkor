/**
 * MEH-1646 self-QA harness — DeliveryBlock order-cutoff line + pickup חינם tag.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1646-deliveryblock.mjs [baseURL] [chromiumPath]
 * The backend is unreachable from the CC sandbox, so the producer API is
 * intercepted at the Playwright layer and served a fixture (client-side fetch
 * path — ProducerDetail renders from /api/producers/{id}).
 * REUSES: frontend/e2e/qa-meh1643-hero-delivery-cta.mjs (manual QA-harness pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1646", import.meta.url).pathname;
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
  order_window: { wednesday: { open: "09:00", close: "14:00" } },
  locations: [
    { kind: "pickup", label: "החווה", city: "עתלית", lat: 32.7, lng: 34.94 },
    { kind: "market_stand", label: "דוכן שוק תלפיות", city: "חיפה", lat: 32.81, lng: 34.99 },
  ],
  delivery_areas: [
    { id: 1, city: "זכרון יעקב", min_order: 100, delivery_day: "שישי" },
    { id: 2, city: "עתלית", min_order: 120, delivery_day: "שישי" },
  ],
};

const groupProducer = {
  ...baseProducer,
  delivery_areas: [
    { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
    { id: 2, city: "עכו", min_order: 80, delivery_day: "שלישי" },
  ],
};

const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });

async function shot(name, viewport, producer) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/producers\/123$/.test(url)) {
      return route.fulfill({ json: producer });
    }
    if (/\/api\/producers(\?|$)/.test(url)) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${BASE}/producer/123`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);
  const cutoff = page.getByTestId("delivery-order-cutoff");
  console.log(name, "cutoff line:", JSON.stringify(await cutoff.textContent().catch(() => "ABSENT")));
  const free = await page.getByText("חינם").count();
  console.log(name, "חינם tags:", free);
  const section = page.locator("section", { hasText: "משלוחים" }).last();
  await section.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

await shot("producer-375-hoist-cutoff", { width: 375, height: 812 }, baseProducer);
await shot("producer-1440-hoist-cutoff", { width: 1440, height: 900 }, baseProducer);
await shot("producer-375-group-cutoff-only", { width: 375, height: 812 }, groupProducer);
await shot(
  "producer-375-no-window",
  { width: 375, height: 812 },
  { ...baseProducer, order_window: null },
);

await browser.close();
