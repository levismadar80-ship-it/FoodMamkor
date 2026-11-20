/**
 * MEH-2730 self-QA — the rescue-bags counter screen:
 *   - a refused publish shows the server's reason INSIDE the publish box
 *   - a wrong code shows «אין הזמנה פעילה…» by the code box
 *   - the time fields stay inside the publish card
 * Drives the REAL page against `next start` on :3100 (built with
 * NEXT_PUBLIC_RESCUE_BAGS_ENABLED=true), /api/** from fixtures. 375 + 1440.
 * Chromium only — iOS Safari's wider time input is not reproducible here.
 * Run manually:  node e2e/qa-meh2730-rescue-notices.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2730";
const BASE = "http://localhost:3100";
const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה", producer_id: "p-42", producer_kind: "producer" };
const PROFILE = { id: 42, name: "מאפיית שדה", status: "approved" };
const LOCS = [{ id: "loc1", location_precision: "exact", is_primary: true, city: "זכרון יעקב" }];
const REFUSAL = "רק בית עסק מאושר יכול לפרסם סל הפתעה";
const failures = [];
const check = (l, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures.push(l); };

async function run(browser, label, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (req.method() === "POST" && path === "/rescue/offers") {
      return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: REFUSAL }) });
    }
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
  await page.getByTestId("rescue-publish-today").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);

  // time fields inside the card
  const card = await page.locator('[data-notice-scope="publish"]').boundingBox();
  for (const id of ["rescue-publish-from", "rescue-publish-to"]) {
    const b = await page.getByTestId(id).boundingBox();
    check(`[${label}] ${id} inside the publish card`, b.x >= card.x - 0.5 && b.x + b.width <= card.x + card.width + 0.5);
  }

  // wrong code → by the code box
  await page.getByTestId("rescue-code-input").fill("222");
  await page.getByTestId("rescue-code-submit").click();
  const n1 = page.getByTestId("rescue-tab-notice");
  await n1.waitFor();
  check(`[${label}] wrong code message by the code box`,
    (await n1.evaluate((el) => el.closest("[data-notice-scope]")?.dataset.noticeScope)) === "code");
  await page.screenshot({ path: `${OUT}/code-not-found-${label}.png` });

  // refused publish → inside the publish box, with the reason
  await page.getByTestId("rescue-publish-today").click();
  await page.waitForTimeout(400);
  const n2 = page.getByTestId("rescue-tab-notice");
  check(`[${label}] one message on screen`, (await n2.count()) === 1);
  check(`[${label}] refusal text is the server's («${await n2.innerText()}»)`, (await n2.innerText()) === REFUSAL);
  check(`[${label}] refusal sits in the publish box`,
    (await n2.evaluate((el) => el.closest("[data-notice-scope]")?.dataset.noticeScope)) === "publish");
  await n2.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${label}] no horizontal scroll`, sw <= width);
  await page.screenshot({ path: `${OUT}/publish-refused-${label}.png` });
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) await run(browser, label, w, h);
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
