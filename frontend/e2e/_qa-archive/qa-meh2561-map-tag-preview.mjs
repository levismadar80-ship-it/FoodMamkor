/**
 * MEH-2561 self-QA — DeliveryCard's "בכרטיס במפה יופיע" preview.
 *
 * Drives the REAL dashboard edit page against `next start` on :3100 with every
 * /api/** call fulfilled from fixtures (the CC sandbox has no backend).
 * Captures 375px + 1440px in two states: arranged (tag + hint) and
 * delivery+pickup (two green tags, no hint).
 *
 * Run manually:  node e2e/qa-meh2561-map-tag-preview.mjs
 * REUSES: e2e/qa-meh2264-special-hours.mjs (route-fixture + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2561";
const BASE = "http://localhost:3100";

const BASE_PROFILE = {
  id: 42,
  name: "כוורת אור הבשמת",
  slug: "kaveret",
  status: "approved",
  is_approved: true,
  categories: [{ id: 2, name: "דבש" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
  delivery_nationwide: false,
  delivery_areas: [],
  locations: [],
};
const STATES = {
  arranged: {},
  both: {
    offers_delivery: true,
    delivery_areas: [{ city: "חיפה" }, { city: "זכרון יעקב" }],
    locations: [{ kind: "pickup", city: "בנימינה" }],
  },
};
const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const failures = [];
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
}

async function shot(browser, label, width, height, state) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  const profile = { ...BASE_PROFILE, ...STATES[state] };
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/auth/me" ? USER
      : path === "/producers/me" ? profile
      : path === "/producers/me/dashboard" ? { producer: profile }
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/dashboard/edit?group=location`, { waitUntil: "load" });
  const btn = page.getByRole("button", { name: /משלוחים ואיסוף/ }).first();
  await btn.waitFor({ timeout: 20_000 });
  await btn.click();
  const box = page.getByTestId("delivery-map-preview");
  await box.waitFor({ timeout: 10_000 });
  await box.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await page.waitForTimeout(300);
  const text = await box.innerText();
  console.log(`[${label}/${state}] ${text.replace(/\n/g, " | ")}`);
  const hint = await page.getByTestId("delivery-map-preview-hint").count();
  check(`[${label}/${state}] hint ${state === "arranged" ? "shown" : "absent"}`, hint === (state === "arranged" ? 1 : 0));
  await page.screenshot({ path: `${OUT}/preview-${state}-${label}.png` });
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) {
  for (const state of Object.keys(STATES)) await shot(browser, label, w, h, state);
}
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
