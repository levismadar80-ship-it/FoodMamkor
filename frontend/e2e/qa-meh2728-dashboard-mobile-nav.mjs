/**
 * MEH-2728 self-QA — owner dashboard navigation on a phone:
 *   - the tab bar stays visible under the sticky site header after scrolling
 *   - «התנתקות» only at the bottom of «סקירה», muted (absent on «עריכה»)
 *   - «סלי הפתעה» has «חזרה לכלים» and the «כלים» tab is lit there
 *
 * Drives the REAL pages against `next start` on :3100 (built with
 * NEXT_PUBLIC_RESCUE_BAGS_ENABLED=true) with every /api/** call fulfilled from
 * fixtures (the CC sandbox has no backend). 375 + 1440.
 * Run manually:  node e2e/qa-meh2728-dashboard-mobile-nav.mjs
 * REUSES: e2e/qa-meh2695-badge-request-line.mjs (route-fixture harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2728";
const BASE = "http://localhost:3100";
const PROFILE = {
  id: 42, name: "כוורת אור הבשמת", slug: "kaveret", status: "approved", is_approved: true,
  categories: [{ id: 2, name: "דבש" }], products: [], images: [], has_physical_location: true,
  offers_delivery: false, delivery_nationwide: false, delivery_areas: [], locations: [],
};
const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה", producer_id: "p-42", producer_kind: "producer", email_verified: true };
const failures = [];
const check = (l, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures.push(l); };

async function context(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body = path === "/auth/me" ? USER
      : path === "/producers/me" ? PROFILE
      : path === "/producers/me/dashboard" ? { producer: PROFILE }
      : path === "/producers/me/analytics" ? {}
      : path === "/producers/me/rescue/typical-items" ? { items: [] } : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  return ctx;
}

async function run(browser, label, width, height) {
  const ctx = await context(browser, width, height);
  const page = await ctx.newPage();
  const mobile = width < 768;

  // 1. edit hub → products group, scrolled: the tab bar must sit below the header.
  await page.goto(`${BASE}/producer/dashboard/edit?group=products`, { waitUntil: "load" });
  await page.getByTestId("dashboard-tab-edit").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  const header = await page.locator("header").first().boundingBox();
  const navBox = await page.getByRole("navigation", { name: /./ }).filter({ has: page.getByTestId("dashboard-tab-edit") }).boundingBox();
  check(`[${label}] tab bar below header after scroll (nav.top ${navBox?.y?.toFixed(0)} >= header.bottom ${(header.y + header.height).toFixed(0)})`,
    navBox && navBox.y >= header.y + header.height - 1);
  check(`[${label}] tab bar on screen after scroll`, navBox && navBox.y < 200);
  await page.screenshot({ path: `${OUT}/edit-scrolled-${label}.png` });
  check(`[${label}] no logout on «עריכה»`, (await page.getByTestId("dashboard-mobile-logout").count()) === 0);

  // 2. overview bottom: muted logout (phones only).
  await page.goto(`${BASE}/producer/dashboard`, { waitUntil: "load" });
  await page.getByTestId("dashboard-tab-overview").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const lo = page.getByTestId("dashboard-mobile-logout");
  if (mobile) {
    await lo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const color = await lo.evaluate((el) => getComputedStyle(el).color);
    console.log(`[${label}] logout color ${color}`);
    check(`[${label}] logout visible on «סקירה»`, await lo.isVisible());
    await page.screenshot({ path: `${OUT}/overview-bottom-${label}.png` });
  } else {
    check(`[${label}] logout hidden on desktop (header menu)`, !(await lo.isVisible()));
  }

  // 3. rescue: back link + tools tab lit.
  await page.goto(`${BASE}/producer/dashboard/rescue`, { waitUntil: "load" });
  await page.getByTestId("rescue-dashboard-page").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const back = page.getByRole("link", { name: "חזרה לכלים" });
  check(`[${label}] rescue has «חזרה לכלים»`, await back.isVisible());
  check(`[${label}] back → /producer/dashboard/tools`, /\/producer\/dashboard\/tools$/.test((await back.getAttribute("href")) || ""));
  check(`[${label}] «כלים» tab lit on rescue`, (await page.getByTestId("dashboard-tab-tools").getAttribute("aria-current")) === "page");
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${label}] no horizontal scroll (${sw} <= ${width})`, sw <= width);
  await page.screenshot({ path: `${OUT}/rescue-top-${label}.png` });
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) await run(browser, label, w, h);
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
