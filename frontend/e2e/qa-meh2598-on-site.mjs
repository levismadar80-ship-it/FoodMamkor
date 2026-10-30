/**
 * MEH-2598 self-QA — «קנייה במקום» on /map: the card tag and the sheet filter.
 *
 * Evidence is the REQUEST URL (does `on_site=true` reach the API?) plus the
 * rendered tags; the fixture narrows only when the param arrives. Control:
 * `pickup_points`, a sibling service axis that already emitted.
 * Gate: the chip renders only with >= 5 `sells_on_site` businesses in the
 * mount snapshot — run A has 5 (chip shown), run B has 1 (chip hidden).
 *
 * Every /api/** call is fulfilled from fixtures (no backend in the sandbox).
 * Run manually against `next start` on 3100:  node e2e/qa-meh2598-on-site.mjs
 * REUSES: e2e/qa-meh2133-map-no-added-sugar.mjs.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2598";
const BASE = "http://localhost:3100";

const CAT = { id: 2, name: "לחמים ואפייה" };
const base = (n, name, extra) => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`,
  name,
  slug: `biz-${n}`,
  city: "תל אביב",
  lat: 32.07 + n / 100,
  lng: 34.78,
  categories: [CAT],
  is_approved: true,
  status: "approved",
  has_physical_location: true,
  location_precision: "exact",
  images: [],
  delivers: false,
  offers_pickup: false,
  sells_on_site: false,
  ...extra,
});
const RICH = [
  base(1, "מאפיית שלושת השירותים", { delivers: true, offers_pickup: true, sells_on_site: true }),
  base(2, "חנות ומשלוח", { delivers: true, sells_on_site: true }),
  base(3, "חנות בלבד", { sells_on_site: true }),
  base(4, "חנות שכונתית", { sells_on_site: true }),
  base(5, "מעדנייה", { sells_on_site: true }),
  base(6, "בתיאום בלבד", {}),
  base(7, "איסוף בלבד", { offers_pickup: true }),
];
const POOR = RICH.map((p, i) => ({ ...p, sells_on_site: i === 0 }));

const failures = [];
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

async function run(browser, { label, width, height, all, expectChip }) {
  const requests = [];
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce", hasTouch: width < 768 });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    requests.push(url);
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, "");
    let body = [];
    if (path === "/categories") body = [CAT];
    else if (path.startsWith("/producers")) {
      body = all;
      const ors = [];
      if (u.searchParams.get("on_site") === "true") ors.push((p) => p.sells_on_site);
      if (u.searchParams.get("pickup_points") === "true") ors.push((p) => p.offers_pickup);
      if (ors.length) body = all.filter((p) => ors.some((f) => f(p)));
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("cookieConsent", "essential"); } catch {}
  });
  await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
  await page.locator(".leaflet-container:visible").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);

  if (expectChip) {
    const tags = await page.locator('[data-testid="map-card"]:visible [data-testid^="map-fulfillment-"]').allInnerTexts();
    console.log(`[${label}] card tags: ${tags.join(" | ")}`);
    check(`[${label}] three-service card shows «קנייה במקום»`, tags.includes("קנייה במקום"));
    if (width < 768) {
      // Lift the bottom sheet (touch-driven, MapBottomSheet onTouch*) via CDP.
      const box = await page.getByTestId("sheet-count").boundingBox();
      if (box) {
        const cdp = await ctx.newCDPSession(page);
        const x = box.x + box.width / 2;
        const touch = (type, y) =>
          cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
        await touch("touchStart", box.y - 10);
        for (let y = box.y - 10; y > 140; y -= 40) await touch("touchMove", y);
        await touch("touchEnd");
        await page.waitForTimeout(900);
      }
    }
    await page.screenshot({ path: `${OUT}/cards-${label}.png` });
  }

  const btn = page.locator('button[aria-controls="filter-sheet-panel"]:visible').first();
  await btn.waitFor({ state: "visible", timeout: 20_000 });
  await btn.click();
  await page.waitForTimeout(700);
  const chip = page.locator('[data-testid="chip-on_site"]:visible');
  check(`[${label}] chip ${expectChip ? "shown" : "hidden (gate)"}`, (await chip.count()) === (expectChip ? 1 : 0));
  if (!expectChip) { await ctx.close(); return; }

  // Control first: the sibling axis must emit, or every "no param" is void.
  const m0 = requests.length;
  await page.locator('[data-testid="chip-pickup_points"]:visible').first().click();
  await page.waitForTimeout(1200);
  check(`[${label}] control: pickup_points=true emitted`, requests.slice(m0).some((u) => u.includes("pickup_points=true")));
  await page.locator('[data-testid="chip-pickup_points"]:visible').first().click();
  await page.waitForTimeout(1200);

  const m1 = requests.length;
  await chip.first().click();
  await page.waitForTimeout(1500);
  check(`[${label}] on_site=true emitted`, requests.slice(m1).some((u) => u.includes("on_site=true")));
  await page.screenshot({ path: `${OUT}/sheet-on-${label}.png` });
  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) {
  await run(browser, { label, width: w, height: h, all: RICH, expectChip: true });
  await run(browser, { label: `${label}-gated`, width: w, height: h, all: POOR, expectChip: false });
}
await browser.close();
if (failures.length) { console.log(`FAILURES: ${failures.length}`); process.exit(1); }
console.log("ALL PASS");
