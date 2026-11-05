/**
 * MEH-2695 self-QA — the «חסר תג שמתאים לעסק שלך? כתבו לנו» line at the end of
 * the products group in the owner dashboard edit tab.
 *
 * Drives the REAL page against `next start` on :3100 with every /api/** call
 * fulfilled from fixtures (the CC sandbox has no backend). 375 + 1440.
 * Run manually:  node e2e/qa-meh2695-badge-request-line.mjs
 * REUSES: e2e/qa-meh2561-map-tag-preview.mjs (route-fixture harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2695";
const BASE = "http://localhost:3100";
const PROFILE = {
  id: 42, name: "כוורת אור הבשמת", slug: "kaveret", status: "approved", is_approved: true,
  categories: [{ id: 2, name: "דבש" }], products: [], images: [], has_physical_location: true,
  offers_delivery: false, delivery_nationwide: false, delivery_areas: [], locations: [],
};
const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };
const failures = [];
const check = (l, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures.push(l); };

async function shot(browser, label, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body = path === "/auth/me" ? USER
      : path === "/producers/me" ? PROFILE
      : path === "/producers/me/dashboard" ? { producer: PROFILE }
      : path === "/producers/me/analytics" ? {} : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/dashboard/edit?group=products`, { waitUntil: "load" });
  const line = page.getByTestId("badge-request-line");
  await line.waitFor({ timeout: 20_000 });
  await line.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 220));
  await page.waitForTimeout(300);
  const text = await line.innerText();
  console.log(`[${label}] ${text}`);
  check(`[${label}] copy`, text.includes("חסר תג שמתאים לעסק שלך?") && text.includes("כתבו לנו"));
  const href = await line.getByRole("link").getAttribute("href");
  check(`[${label}] href ends with /about#contact (got ${href})`, /\/about#contact$/.test(href || ""));
  const box = await line.getByRole("link").boundingBox();
  check(`[${label}] tap target >= 44px (got ${box?.height})`, (box?.height || 0) >= 44);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${label}] no horizontal scroll (${sw} <= ${width})`, sw <= width);
  await page.screenshot({ path: `${OUT}/badge-request-${label}.png` });
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) await shot(browser, label, w, h);
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
