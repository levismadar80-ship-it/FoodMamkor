/**
 * Module:   qa-meh2198-fallback-captions
 * Purpose:  Self-QA captures for MEH-2198 — delivery-day captions under the
 *           region-fallback cards on a day-zero home grid, at 375 and 1440.
 * Touches:  Nothing real. Every /producers request is answered from the
 *           fixtures below; no backend, no database, no Railway (egress to
 *           Railway is blocked from the CC sandbox — MEH-2090).
 * Does NOT: prove the extraction logic. That is asserted in
 *           __tests__/HomeEmptyStateCauseAware.test.jsx, whose count
 *           assertion was shown red BOTH against the pre-fix component (0
 *           captions) and against an injected over-captioning defect (4
 *           captions) — the omission rule needs a guard in both directions,
 *           because the failure that matters is a caption that should not
 *           exist. This script is LAYOUT evidence only, and Chromium
 *           emulation is not engine evidence (MEH-1511 carve-out e).
 * Related:  app/[locale]/home/HomeProducersGrid.jsx (deliveryDaysForCity);
 *           backend/app/services/producer_listing.py:274 (the city match
 *           this mirrors).
 * History:  MEH-2198.
 *
 * Usage:  node scripts/qa-meh2198-fallback-captions.mjs   (needs `next start -p 3100`)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3100";
const OUT = "qa-artifacts/MEH-2198";
const CITY = "כפר סבא"; // member of REGIONS.השרון (data/regions.js:86)
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });

// Deliberately covers all three caption outcomes plus week-ordering:
//   101 → two days, stored out of week order  → "משלוח לכפר סבא: שני · שישי"
//   102 → a city row with a null delivery_day → the by-arrangement caption
//   103 → rows for a DIFFERENT city only      → NO caption (Edge B)
//   104 → no delivery_areas key at all        → NO caption (Edge B)
const regionProducers = [
  {
    id: 101,
    name: "משק הדס",
    city: "הרצליה",
    delivery_areas: [
      { city: CITY, delivery_day: "שישי" },
      { city: CITY, delivery_day: "שני" },
    ],
  },
  {
    id: 102,
    name: "גבינות רמת השרון",
    city: "רמת השרון",
    delivery_areas: [{ city: CITY, delivery_day: null }],
  },
  {
    id: 103,
    name: "מאפיית נתניה",
    city: "נתניה",
    delivery_areas: [{ city: "חיפה", delivery_day: "ראשון" }],
  },
  { id: 104, name: "דבש כפר יונה", city: "כפר יונה" },
];

/**
 * `lib/api.js` uses `baseURL: "/api"` and next.config.js `rewrites()` proxies
 * that SERVER-SIDE, so these requests are SAME-ORIGIN. Gating on `/api/`
 * (Next's own chunks live under `/_next/`) is what makes the mock the cause of
 * the empty grid rather than the blocked Railway egress failing the request
 * into `.catch(() => {})`. `served` below is the control that proves it.
 */
const served = { list: 0, region: 0 };
async function stub(page) {
  await page.route(
    (url) => url.pathname.startsWith("/api/") && /\/producers/.test(url.pathname),
    (route) => {
      const q = new URL(route.request().url()).searchParams;
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
  served.list = 0;
  served.region = 0;
  // The sandbox ships Chromium at a pinned path and the project's Playwright
  // pin expects a different build number; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is
  // set here, so point at the installed binary rather than downloading one.
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await stub(page);
  const url = `${BASE}/he?city=${encodeURIComponent(CITY)}&day=${encodeURIComponent("שלישי")}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const fallback = page.getByTestId("region-fallback");
  await fallback.waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("fallback-day-caption").first().waitFor({ state: "visible", timeout: 30_000 });

  // Put the fallback header at the top of the viewport, then back off the
  // sticky search header — which otherwise covers the copy under test.
  await fallback.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => globalThis.scrollBy(0, -120));
  await page.waitForTimeout(400); // settle the scroll, not the network

  const captions = await page.getByTestId("fallback-day-caption").allInnerTexts();
  // `:scope >` matters: a bare ".grid > *" also matches grids INSIDE
  // ProducerCard, which reported 8 children for a 4-card grid on the first
  // run. The probe was wrong, not the page — and it threw rather than
  // quietly accepting a number that looked plausible.
  const cards = await fallback.locator(":scope > .grid > *").count();

  // Containment: every caption must sit INSIDE its own grid cell. The first
  // capture of this ticket had them spilling out and overlapping the row of
  // cards below, because ProducerCard's root is `h-full` and the caption was a
  // plain sibling. jsdom has no layout, so this is the only place that can
  // catch it — and a screenshot alone would not have, unless someone looked.
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="fallback-day-caption"]')].map((el) => {
      const cell = el.closest(".grid > *") || el.parentElement;
      return Math.round(el.getBoundingClientRect().bottom - cell.getBoundingClientRect().bottom);
    }),
  );

  const facts = {
    viewport: vp.name,
    captionOverflowPx: overflow,
    mockedListCalls: served.list,
    mockedRegionCalls: served.region,
    cardsInGrid: cards,
    captionCount: captions.length,
    captions,
  };
  console.log("  facts:", JSON.stringify(facts));

  // CONTROL FIRST — if the mock never served, every number below is void.
  if (served.list === 0 || served.region === 0) {
    throw new Error(
      `mock never served (list=${served.list}, region=${served.region}) — this run measured nothing`,
    );
  }
  // The grid must be INTACT: four cards, whatever the captions do.
  if (cards !== regionProducers.length) {
    throw new Error(`fallback grid lost cards: ${cards} of ${regionProducers.length}`);
  }
  // Exactly two of the four earn a caption. A count, not a presence check:
  // 4 would mean the omission rule (Edge B) is gone, which is the failure that
  // actually matters — an unverifiable delivery promise on screen.
  if (captions.length !== 2) {
    throw new Error(`expected exactly 2 captions, got ${captions.length}`);
  }
  if (!captions[0].includes("שני · שישי")) {
    throw new Error(`first caption is not week-sorted: ${captions[0]}`);
  }
  if (overflow.some((px) => px > 1)) {
    throw new Error(`caption overflows its grid cell by ${JSON.stringify(overflow)} px`);
  }
  if (!captions[1].includes("בתיאום מראש")) {
    throw new Error(`second caption is not the by-arrangement variant: ${captions[1]}`);
  }

  const file = `${OUT}/fallback-captions-${vp.name}.png`;
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
