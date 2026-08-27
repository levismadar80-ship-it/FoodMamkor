/**
 * Module:   qa-meh2197-day-zero
 * Purpose:  Self-QA captures for MEH-2197 — the compact, cause-aware day-zero
 *           empty state on the home producers grid, at 375 px and 1440 px.
 * Touches:  Nothing real. Every /producers request is answered from the
 *           fixtures below; no backend, no database, no Railway (egress to
 *           Railway is blocked from the CC sandbox — MEH-2090).
 * Does NOT: prove the branch logic. That is asserted in
 *           __tests__/HomeEmptyStateCauseAware.test.jsx, which was shown red
 *           against the pre-fix component. This script is LAYOUT evidence
 *           only, and Chromium emulation is not engine evidence
 *           (MEH-1511 carve-out e).
 * Related:  app/[locale]/home/HomeProducersGrid.jsx; lib/use-home-page.js:427
 *           (the regionFallback effect this drives).
 * History:  MEH-2197.
 *
 * Usage:  node scripts/qa-meh2197-day-zero.mjs   (needs `next start -p 3100`)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3100";
const OUT = "qa-artifacts/MEH-2197";
const CITY = "כפר סבא"; // member of REGIONS.השרון (data/regions.js:86)
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });

const regionProducers = [
  { id: 101, name: "משק הדס", city: "הרצליה" },
  { id: 102, name: "גבינות רמת השרון", city: "רמת השרון" },
  { id: 103, name: "מאפיית נתניה", city: "נתניה" },
  { id: 104, name: "דבש כפר יונה", city: "כפר יונה" },
];

/**
 * `lib/api.js` uses `baseURL: "/api"` and next.config.js `rewrites()` proxies
 * that SERVER-SIDE, so these requests are SAME-ORIGIN — an `url.origin !== BASE`
 * predicate (the idiom in the older qa-* scripts, whose forms leave the origin)
 * matches nothing here and the page then shows an empty grid for the WRONG
 * reason: the proxy to Railway is egress-blocked from this sandbox (MEH-2090),
 * the request fails, and `.catch(() => {})` in use-home-page.js leaves
 * `producers` at []. That is a zero-result with two possible causes and it is
 * indistinguishable on screen from the state under test. Gating on `/api/`
 * (Next's own chunks live under `/_next/`) is what makes the mock the cause,
 * and `served` below is the control that proves it.
 */
const served = { list: 0, region: 0 };
async function stub(page) {
  await page.route(
    (url) => url.pathname.startsWith("/api/") && /\/producers/.test(url.pathname),
    (route) => {
      const q = new URL(route.request().url()).searchParams;
      // The region-fallback effect is the ONLY caller passing delivery_cities.
      const isRegion = q.has("delivery_cities");
      if (isRegion) served.region += 1;
      else served.list += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isRegion ? regionProducers : []),
      });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/") && /\/categories/.test(url.pathname),
    (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

const shots = [];
async function capture(vp) {
  // The sandbox ships Chromium at a pinned path and the project's Playwright
  // pin expects a different build number; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is
  // set here, so point at the installed binary rather than downloading one.
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  served.list = 0;
  served.region = 0;
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await stub(page);
  const url = `${BASE}/he?city=${encodeURIComponent(CITY)}&day=${encodeURIComponent("שלישי")}&day=${encodeURIComponent("חמישי")}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Gate on the elements themselves, never on network quiet (`networkidle` is
  // banned — testing.md, MEH-215).
  const dayBlock = page.getByTestId("day-empty-suggestion");
  const fallback = page.getByTestId("region-fallback");
  await dayBlock.waitFor({ state: "visible", timeout: 30_000 });
  await fallback.waitFor({ state: "visible", timeout: 30_000 });

  // The grid sits ~3000 px down the homepage, and the app scrolls to it when a
  // city is chosen (use-home-page.js handleCitySelected). Reproduce that: put
  // the day note at the top of the viewport, then measure the first fallback
  // card VIEWPORT-relative. boundingBox() is document-relative and would report
  // the page offset (~3082 px) — a number that says nothing about the fold.
  await dayBlock.evaluate((el) => el.scrollIntoView({ block: "start" }));
  // Back off the sticky search header, which otherwise covers the very copy
  // under test — measured on the first capture, where the day note sat half
  // hidden behind it. A capture that occludes its own subject is not evidence.
  await page.evaluate(() => globalThis.scrollBy(0, -120));
  await page.waitForTimeout(400); // settle the scroll, not the network

  // CONTROL — the capture refuses to write an image that would not show what
  // it claims. A screenshot proves pixels, not semantics; these read the DOM
  // in the same run. If any of them is wrong the PNG is never written, so a
  // file on disk cannot be a green with two causes.
  const box = await dayBlock.boundingBox();
  const heroInDayBlock = await dayBlock.locator(".bg-primary").count();
  const headerText = await fallback.locator("h3").first().innerText();
  const emptyHeadings = await page.getByTestId("empty-generic").count();
  // "visible in the first viewport" is about the CARDS, not the header —
  // the header being on screen while the grid is below the fold is the exact
  // dead-end this ticket removes.
  const firstCardTop = await fallback
    .locator(".grid > *")
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().top));

  const facts = {
    viewport: vp.name,
    mockedListCalls: served.list,
    mockedRegionCalls: served.region,
    dayBlockHeightPx: Math.round(box.height),
    heroButtonsInDayBlock: heroInDayBlock,
    fallbackHeader: headerText,
    genericEmptyStates: emptyHeadings,
    firstCardTopInViewportPx: firstCardTop,
  };
  console.log("  facts:", JSON.stringify(facts, null, 0));

  // Run the control FIRST: if the mock never served, every reassuring number
  // below is void — an unmocked run reaches this same zero-result by failure.
  if (served.list === 0 || served.region === 0) {
    throw new Error(
      `mock never served (list=${served.list}, region=${served.region}) — this run measured nothing`,
    );
  }
  if (heroInDayBlock !== 0) throw new Error("day block still carries a bg-primary hero button");
  // Target is ~40 px (one line). At 375 the Hebrew note plus its inline CTA
  // wraps to two lines — measured 56 px — so the bound is 60, not 40. The old
  // block was ~150 px (text-center py-8 + a px-6 py-3 hero button).
  if (box.height > 60) throw new Error(`day block too tall: ${box.height}px`);
  if (!headerText.startsWith("בינתיים")) {
    throw new Error(`fallback header is not the _days variant: ${headerText}`);
  }
  if (firstCardTop > vp.height) {
    throw new Error(
      `first region-fallback card starts below the fold (top=${firstCardTop} > ${vp.height})`,
    );
  }

  const file = `${OUT}/day-zero-${vp.name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  shots.push(file);
  console.log("  captured", file);
  await browser.close();
  return facts;
}

const all = [];
for (const vp of VIEWPORTS) {
  console.log(`\n[${vp.name}] capturing…`);
  all.push(await capture(vp));
}
console.log("\nDONE", shots.length, "shots:", shots.join(" "));
console.log(JSON.stringify(all, null, 2));
