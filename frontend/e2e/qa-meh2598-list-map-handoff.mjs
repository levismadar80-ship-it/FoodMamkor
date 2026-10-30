/**
 * MEH-2598 follow-up self-QA — filters travel between the list and the map.
 * /producers?on_site=1 → «הצגה במפה» href; /map?on_site=1 lands with the chip
 * pressed and a filtered GET; a toggle on /map rewrites the URL.
 * Client /api/** is fixtured. Run against `next start` on 3100.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2598";
const BASE = "http://localhost:3100";
const CAT = { id: 2, name: "לחמים ואפייה" };
const ALL = Array.from({ length: 7 }, (_, i) => ({
  id: `${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}-1111-4111-8111-111111111111`,
  name: `מאפייה ${i + 1}`, slug: `biz-${i + 1}`, city: "תל אביב",
  lat: 32.07 + i / 100, lng: 34.78, categories: [CAT], is_approved: true, status: "approved",
  has_physical_location: true, location_precision: "exact", images: [],
  delivers: i % 2 === 0, offers_pickup: i === 1, sells_on_site: i < 5,
}));
const failures = [];
const check = (l, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures.push(l); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "he-IL", reducedMotion: "reduce" });
  const producerCalls = [];
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, "");
    let body = [];
    if (path === "/categories") body = [CAT];
    else if (path === "/producers") {
      producerCalls.push(u.search);
      body = u.searchParams.get("on_site") ? ALL.filter((p) => p.sells_on_site) : ALL;
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "x-total-count": String(ALL.length) }, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("cookieConsent", "essential"); } catch {} });

  await page.goto(`${BASE}/producers?on_site=1`, { waitUntil: "domcontentloaded" });
  const link = page.locator('[data-testid="producers-map-link"]');
  await link.waitFor({ timeout: 30_000 });
  check(`[${label}] /producers link carries on_site`, (await link.getAttribute("href")) === "/map?on_site=1");
  await page.screenshot({ path: `${OUT}/handoff-producers-${label}.png` });

  await link.click();
  await page.waitForURL(/\/map/, { timeout: 30_000 });
  const chip = page.locator('[data-testid="map-service-chip-on_site"]:visible').first();
  await chip.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  check(`[${label}] /map chip pressed on arrival`, (await chip.getAttribute("aria-pressed")) === "true");
  check(`[${label}] /map fetched the filtered list`, producerCalls.some((s) => s.includes("on_site=true")));
  const count = await page.getByText(/5 בתי עסק/).count();
  check(`[${label}] /map shows the 5 filtered businesses`, count > 0);
  await page.screenshot({ path: `${OUT}/handoff-map-${label}.png` });

  await page.locator('[data-testid="map-service-chip-has_delivery"]:visible').first().click();
  await page.waitForTimeout(500);
  const sp = new URL(page.url()).searchParams;
  check(`[${label}] toggle mirrored to URL`, sp.get("has_delivery") === "1" && sp.get("on_site") === "1");
  await ctx.close();
}
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
