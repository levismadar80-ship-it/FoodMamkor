/**
 * MEH-1645 self-QA harness — home delivery-day filter (progressive disclosure).
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1645-day-filter.mjs [baseURL] [chromiumPath]
 * The producers API is intercepted (backend unreachable from the CC sandbox):
 * a fixture list normally; [] when delivery_day is present with day=שלישי so
 * the empty-state suggestion state can be captured.
 * REUSES: frontend/e2e/qa-meh1646-deliveryblock.mjs (fixture-intercept pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3103";
const OUT = new URL("../../qa-artifacts/MEH-1645", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const producers = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "חוות הזית",
    city: "עתלית",
    is_approved: true,
    offers_delivery: true,
    delivery_areas: [{ city: "חיפה", delivery_day: "שישי" }],
    categories: [],
    images: [],
  },
];

const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });

async function run(name, viewport, { clickDay, expectEmpty } = {}) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  const calls = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/producers")) {
      calls.push(url.search);
      const day = url.searchParams.get("delivery_day");
      return route.fulfill({ json: day === "שלישי" ? [] : producers });
    }
    if (url.pathname.endsWith("/stats")) return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${BASE}/?city=${encodeURIComponent("חיפה")}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  const row = page.getByTestId("delivery-day-row");
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log(name, "day row visible:", await row.isVisible().catch(() => false));
  if (clickDay) {
    await page.getByTestId(`delivery-day-pill-${clickDay}`).click();
    await page.waitForTimeout(1200);
    console.log(name, "URL after pill:", page.url());
    console.log(name, "chip:", JSON.stringify(await page.getByTestId("location-filter-chip").textContent().catch(() => "MISSING")));
    console.log(name, "day api call:", calls.find((c) => c.includes("delivery_day")) ?? "NONE");
  }
  if (expectEmpty) {
    console.log(name, "empty suggestion visible:", await page.getByTestId("day-empty-suggestion").isVisible().catch(() => false));
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

await run("home-375-day-row", { width: 375, height: 812 });
await run("home-375-day-active", { width: 375, height: 812 }, { clickDay: "שישי" });
await run("home-1440-day-active", { width: 1440, height: 900 }, { clickDay: "שישי" });
await run("home-375-day-empty", { width: 375, height: 812 }, { clickDay: "שלישי", expectEmpty: true });

await browser.close();
