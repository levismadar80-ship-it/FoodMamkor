/**
 * MEH-2598 self-QA — one filter row on home, /producers and /map.
 *
 * Asserts the DOM order of each surface's row (סינון → משלוח → איסוף עצמי →
 * קנייה במקום [→ surface extras]) and captures 375 + 1440, plus /map at 320
 * (the MEH-2514 width). Client /api/** calls are fixtures; the fixture has 5
 * businesses with sells_on_site so the gated chip renders. /producers lists
 * server-side (no backend here → empty), so it is deep-linked ?on_site=1 —
 * an active gated axis keeps its chip.
 * Run against `next start` on 3100:  node e2e/qa-meh2598-unified-row.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2598";
const BASE = "http://localhost:3100";
const CAT = { id: 2, name: "לחמים ואפייה" };
const ALL = Array.from({ length: 7 }, (_, i) => ({
  id: `${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}${i + 1}-1111-4111-8111-111111111111`,
  name: `מאפייה ${i + 1}`,
  slug: `biz-${i + 1}`,
  city: "תל אביב",
  lat: 32.07 + i / 100,
  lng: 34.78,
  categories: [CAT],
  is_approved: true,
  status: "approved",
  has_physical_location: true,
  location_precision: "exact",
  images: [],
  delivers: i % 2 === 0,
  offers_pickup: i === 1,
  sells_on_site: i < 5,
}));

const failures = [];
const check = (l, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}`);
  if (!ok) failures.push(l);
};

const SURFACES = [
  { path: "/", row: "home-filter-row", ids: ["home-filters-button", "home-promoted-chip-has_delivery", "home-promoted-chip-pickup_points", "home-promoted-chip-on_site"] },
  { path: "/producers", query: "?on_site=1", row: "producers-filter-row", ids: ["producers-filters-button", "producers-promoted-chip-has_delivery", "producers-promoted-chip-pickup_points", "producers-promoted-chip-on_site"] },
  { path: "/map", row: "map-service-row", ids: ["map-filters-button", "map-service-chip-has_delivery", "map-service-chip-pickup_points", "map-service-chip-on_site"] },
];

async function shoot(browser, s, width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    let body = [];
    if (path === "/categories") body = [CAT];
    else if (path.startsWith("/producers") && !path.includes("count")) body = ALL;
    else if (path.includes("count")) body = { count: ALL.length };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "x-total-count": String(ALL.length) }, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("cookieConsent", "essential"); } catch {}
  });
  await page.goto(`${BASE}${s.path}${s.query || ""}`, { waitUntil: "domcontentloaded" });
  const row = page.locator(`[data-testid="${s.row}"]:visible`).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);
  const ids = await row.locator("[data-testid]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  const got = s.ids.map((id) => ids.indexOf(id));
  console.log(`[${s.path} ${label}] row: ${ids.filter((i) => /button|chip/.test(i)).join(" , ")}`);
  check(`[${s.path} ${label}] order סינון→משלוח→איסוף→קנייה`, got.every((x) => x >= 0) && got.every((x, i) => i === 0 || x > got[i - 1]));
  // Off-screen check: «סינון» must be fully on screen.
  const b = await page.locator(`[data-testid="${s.ids[0]}"]:visible`).first().boundingBox();
  check(`[${s.path} ${label}] «סינון» on screen`, b && b.x >= 0 && b.x + b.width <= width);
  await row.scrollIntoViewIfNeeded();
  const name = s.path === "/" ? "home" : s.path.slice(1);
  await page.screenshot({ path: `${OUT}/row-${name}-${label}.png` });
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const s of SURFACES) {
  for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) await shoot(browser, s, w, h, label);
}
await shoot(browser, SURFACES[2], 320, 700, "320");
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
