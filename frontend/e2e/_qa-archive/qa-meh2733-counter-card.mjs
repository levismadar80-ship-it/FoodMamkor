/**
 * MEH-2733 self-QA — the printable counter card:
 *   - the rescue screen links to it, and it links back
 *   - at 375 the card fits the screen (no horizontal scroll)
 *   - print media keeps the exact A5 width (148mm ≈ 559px) and hides the links
 * Drives the REAL page against `next start` on :3100 (built with
 * NEXT_PUBLIC_RESCUE_BAGS_ENABLED=true), /api/** from fixtures. 375 + 1440.
 * Run manually:  node e2e/qa-meh2733-counter-card.mjs
 * REUSES: e2e/qa-meh2730-rescue-notices.mjs (route-fixture harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2733";
const BASE = "http://localhost:3100";
const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה", producer_id: "p-42", producer_kind: "producer" };
const PROFILE = { id: 42, name: "מאפיית שדה", status: "approved" };
const LOCS = [{ id: "loc1", location_precision: "exact", is_primary: true, city: "זכרון יעקב" }];
const failures = [];
const check = (l, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures.push(l); };

async function run(browser, label, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body = path === "/auth/me" ? USER
      : path === "/producers/me" ? PROFILE
      : path === "/producers/me/locations" ? LOCS
      : path === "/producers/me/rescue/typical-items" ? { items: ["לחם"] } : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/dashboard/rescue`, { waitUntil: "load" });
  const link = page.getByTestId("rescue-counter-card-link");
  await link.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  check(`[${label}] link copy («${await link.innerText()}»)`, (await link.innerText()) === "כרטיס לקופה, להדפסה");
  check(`[${label}] link tap target >= 44px`, ((await link.boundingBox())?.height || 0) >= 44);
  await page.screenshot({ path: `${OUT}/rescue-link-${label}.png` });

  await link.click();
  const card = page.getByTestId("rescue-counter-card");
  await card.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  check(`[${label}] navigated to the card`, page.url().endsWith("/producer/dashboard/rescue/counter-card"));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${label}] no horizontal scroll (${sw} <= ${width})`, sw <= width);
  const art = await card.locator("article").boundingBox();
  check(`[${label}] card inside the viewport (${Math.round(art.x)}..${Math.round(art.x + art.width)})`, art.x >= 0 && art.x + art.width <= width + 0.5);
  await page.screenshot({ path: `${OUT}/counter-card-${label}.png` });

  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(300);
  const printW = await card.locator("article").evaluate((el) => el.getBoundingClientRect().width);
  check(`[${label}] print width is A5 (148mm ≈ 559px, got ${printW.toFixed(1)})`, Math.abs(printW - 559.37) < 1);
  const backVisible = await page.getByRole("link", { name: "חזרה לסלי הפתעה" }).isVisible();
  check(`[${label}] back link hidden in print`, !backVisible);
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("link", { name: "חזרה לסלי הפתעה" }).click();
  await page.getByTestId("rescue-counter-card-link").waitFor({ timeout: 20_000 });
  check(`[${label}] back returns to the rescue screen`, page.url().endsWith("/producer/dashboard/rescue"));
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) await run(browser, label, w, h);
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
