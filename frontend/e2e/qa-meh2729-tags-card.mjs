/**
 * MEH-2729 self-QA — one «תגים» card in the products group of the edit tab.
 * States (5-state rule): 0 tags closed · 0 tags open · 1 tag closed · many
 * (2) closed · many open. Drives the REAL page against `next start` on :3100
 * with /api/** from fixtures. 375 + 1440.
 * Run manually:  node e2e/qa-meh2729-tags-card.mjs
 * REUSES: e2e/qa-meh2695-badge-request-line.mjs (route-fixture harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2729";
const BASE = "http://localhost:3100";
const BASE_PROFILE = {
  id: 42, name: "משק ברק", slug: "barak", status: "approved", is_approved: true,
  categories: [{ id: 2, name: "בשר" }], products: [], images: [], has_physical_location: true,
  offers_delivery: false, delivery_nationwide: false, delivery_areas: [], locations: [],
};
const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה", producer_id: "p-42", producer_kind: "producer" };
const STATES = {
  zero: {},
  one: { grass_fed: true },
  many: { grass_fed: true, vegan_scope: "some", vegetarian_scope: "all", gluten_free_facility: "shared" },
};
const failures = [];
const check = (l, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures.push(l); };

async function shot(browser, label, width, height, stateKey, open) {
  const profile = { ...BASE_PROFILE, ...STATES[stateKey] };
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body = path === "/auth/me" ? USER
      : path === "/producers/me" ? profile
      : path === "/producers/me/dashboard" ? { producer: profile }
      : path === "/producers/me/analytics" ? {} : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/dashboard/edit?group=products`, { waitUntil: "load" });
  const card = page.getByTestId("accordion-tags");
  await card.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  const group = page.getByTestId("group-products");
  const ids = await group.locator('[data-testid^="accordion-"]').evaluateAll((els) => els.map((e) => e.dataset.testid));
  check(`[${label} ${stateKey}] products group cards = products,pricing,offer,tags (${ids.join(",")})`,
    ids.join(",") === "accordion-products,accordion-pricing,accordion-offer,accordion-tags");
  const text = await page.locator("#tags").innerText();
  const expectSummary = { zero: "עוד אין תגים", one: "תג אחד פעיל", many: "2 תגים פעילים" }[stateKey];
  check(`[${label} ${stateKey}] summary «${expectSummary}»`, text.includes(expectSummary));
  if (open) {
    await card.click();
    await page.waitForTimeout(400);
    check(`[${label} ${stateKey}] open shows both sub-headings`,
      (await page.getByRole("heading", { name: "תזונה" }).isVisible()) && (await page.getByRole("heading", { name: "גידול במרעה" }).isVisible()));
  }
  await page.locator("#tags").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -140));
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${label} ${stateKey}] no horizontal scroll`, sw <= width);
  await page.screenshot({ path: `${OUT}/tags-${stateKey}-${open ? "open" : "closed"}-${label}.png`, fullPage: open });
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) {
  await shot(browser, label, w, h, "zero", false);
  await shot(browser, label, w, h, "zero", true);
  await shot(browser, label, w, h, "one", false);
  await shot(browser, label, w, h, "many", false);
  await shot(browser, label, w, h, "many", true);
}
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
