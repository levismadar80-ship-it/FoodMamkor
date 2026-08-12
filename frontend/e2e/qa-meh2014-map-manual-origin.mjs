/**
 * MEH-2014 PR 2 self-QA — a city the user picked as the sort origin.
 *
 * PR 1 made "מרחק" ask for GPS. Its denial copy then promised a manual way out
 * ("אפשר לבחור עיר כדי למיין לפי מרחק") that did not exist. This run drives
 * that promise end to end in a real browser, on the real /map page, against a
 * `next start` server with every /api/** call fulfilled from fixtures (the CC
 * sandbox has no backend and cannot reach Railway — CLAUDE.md "Known Bug
 * Patterns").
 *
 * WHY THE GEOCODER IS MOCKED AND THE PERMISSION IS NOT. Geolocation runs
 * through Playwright's real permission machinery (a context with the
 * permission withheld rejects with code 1 exactly as a user clicking Block
 * does) — that path IS the subject, so stubbing it would be a green with a
 * second possible cause. The geocoder is the opposite: it is a third-party
 * network call, and BOTH providers are route-mocked so the run is deterministic
 * and provider-agnostic (`lib/places.js` picks Google or Nominatim off an env
 * key this harness deliberately does not read — env files are deny-listed, and
 * a harness whose result depends on which provider happened to be configured
 * would be measuring the config, not the diff).
 *
 * VIEWPORTS — 390×844, Pixel 5 (393×851) and 1440×900. The two narrow ones are
 * the ORDERS §3 evidence bundle; 1440 is where the sort <select> actually lives
 * (`hidden lg:grid` — mobile has no sort control and never did, MEH-1864).
 * That asymmetry means the two shells reach the SAME feature by different
 * doors, and both are exercised:
 *   desktop → choose "מרחק" → denied → LocationModal → pick city
 *   mobile  → NearMePill    → denied → LocationModal → pick city
 *
 * Chromium emulation is LAYOUT evidence, not engine evidence. Nothing here
 * claims "נבדק בנייד" — the classes actually covered are RTL layout,
 * horizontal overflow (measured, not eyeballed), and DOM/handler wiring.
 * localStorage persistence is asserted as a storage claim, not a device claim.
 *
 * States captured per viewport:
 *   1. denied-no-origin          — GPS refused, the Hebrew message names the city way out
 *   2. city-origin-active        — origin stored from the picked city, label names it
 *   3. origin-switch-gps-to-city — a GPS fix is replaced by a later city pick
 *   4. after-clear               — clearing drops the record AND the label
 *
 * Run manually:  node e2e/qa-meh2014-map-manual-origin.mjs
 * REUSES: e2e/qa-meh2014-map-nearest.mjs (harness shape, PR 1).
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2014";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const GEO = { latitude: 32.0853, longitude: 34.7818 }; // Tel Aviv
const HAIFA = { lat: 32.794, lng: 34.9896 };
const CITY = "חיפה";

const PRODUCERS = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "מאפיית הצפון", slug: "north", city: "חיפה",
    lat: 32.794, lng: 34.9896, categories: [], images: [], is_approved: true, status: "approved" },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "מאפיית תל אביב", slug: "tlv", city: "תל אביב",
    lat: 32.0853, lng: 34.7818, categories: [], images: [], is_approved: true, status: "approved" },
];

const PIXEL5 = devices["Pixel 5"].viewport;
const VIEWPORTS = [
  { tag: "390", width: 390, height: 844 },
  { tag: "pixel5", width: PIXEL5.width, height: PIXEL5.height },
  { tag: "1440", width: 1440, height: 900 },
];

let failures = 0;
const ran = [];
function check(ok, label, detail) {
  ran.push(label);
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Both geocoding providers, so the run does not depend on which is configured. */
async function routeGeocoder(ctx) {
  await ctx.route("**nominatim.openstreetmap.org**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          place_id: 1,
          display_name: `${CITY}, ישראל`,
          lat: String(HAIFA.lat),
          lon: String(HAIFA.lng),
          address: { city: CITY },
        },
      ]),
    }),
  );
  await ctx.route("**places.googleapis.com/v1/places:autocomplete**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: [
          { placePrediction: { placeId: "haifa-1", structuredFormat: { mainText: { text: CITY } } } },
        ],
      }),
    }),
  );
  await ctx.route("**places.googleapis.com/v1/places/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        formattedAddress: `${CITY}, ישראל`,
        addressComponents: [{ types: ["locality"], longText: CITY }],
        location: { latitude: HAIFA.lat, longitude: HAIFA.lng },
      }),
    }),
  );
}

async function newContext(browser, vp, { grant }) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
    geolocation: GEO,
    permissions: grant ? ["geolocation"] : [],
  });
  // ORDER MATTERS: Playwright resolves routes in REVERSE registration order,
  // so the catch-all goes FIRST and the geocoder mocks after it — otherwise the
  // catch-all matches nominatim/googleapis, falls through to `route.continue()`
  // and hits a network the sandbox blocks. That produced a silent "no origin
  // stored" on the first run of this harness, which reads exactly like a broken
  // feature rather than a broken probe.
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/producers" ? PRODUCERS
      : path === "/categories" ? []
      : path.startsWith("/cities") ? [CITY]
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await routeGeocoder(ctx);
  return ctx;
}

async function openMap(ctx) {
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
  await page.goto(`${BASE}/he/map`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return { page, pageErrors };
}

const SORT = 'select[aria-label="מיון בתי עסק"]';
const ORIGIN_LABEL = '[data-testid="sort-origin-label"]';
const CLEAR = '[data-testid="clear-user-location"]';
const vis = (sel) => `${sel}:visible`;

const stored = (page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem("user_location");
    return raw ? JSON.parse(raw) : null;
  });

async function shoot(page, vpTag, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${vpTag}.png`, fullPage: false });
}

/**
 * Horizontal overflow, MEASURED. `scrollWidth > clientWidth` on the document
 * is the whole claim — an eyeballed screenshot cannot make it, because an
 * overflowing child can sit off-screen and look fine in a viewport-clipped shot.
 */
async function checkNoHorizontalScroll(page, label) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(m.scrollWidth <= m.clientWidth, `no horizontal scroll — ${label}`,
    `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}`);
}

/** RTL is asserted, not assumed — the whole copy set depends on it. */
async function checkRtl(page) {
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
  check(dir === "rtl", "document direction is RTL", `dir=${dir}`);
}

/**
 * Every control here renders once per shell (both are in the DOM; CSS hides
 * one), so assert the VISIBLE count is exactly 1. `:visible` alone would also
 * pass a real double-mount — the MEH-1771/1792 failure mode.
 */
async function checkExactlyOneVisible(page, sel, label) {
  const inDom = await page.locator(sel).count();
  const visible = await page.locator(vis(sel)).count();
  check(visible === 1, label, `${visible} visible of ${inDom} in DOM (one per shell)`);
}

/** Open LocationModal by the door this shell actually has, then pick a city. */
async function reachModalAndPickCity(page, isDesktop) {
  if (isDesktop) {
    await page.selectOption(SORT, "nearest"); // denied → modal
  } else {
    // Icon-only since MEH-1194 — addressed by its aria-label, not its text.
    await page.locator('button[aria-label="הצגת בתי עסק קרובים למיקום שלי"]').first().click();
  }
  await page.waitForTimeout(1200);
  const modal = page.locator('[role="dialog"]');
  const opened = (await modal.count()) > 0;
  check(opened, "denial opens the city fallback modal");
  if (!opened) return false;
  await modal.locator(`button:has-text("${CITY}")`).first().click();
  await page.waitForTimeout(1200);
  return true;
}

async function run(browser, vp) {
  console.log(`\n== /he/map @ ${vp.width}×${vp.height} (${vp.tag}) ==`);
  const isDesktop = vp.width >= 1024; // Tailwind `lg` — the shell boundary.

  // ---- 1 + 2: GPS denied, then a city picked ----------------------------
  const denied = await newContext(browser, vp, { grant: false });
  const { page, pageErrors } = await openMap(denied);

  await checkRtl(page);
  await checkNoHorizontalScroll(page, "fresh load");
  check((await stored(page)) === null, "nothing stored on load");
  check((await page.locator(vis(ORIGIN_LABEL)).count()) === 0,
    "no origin label when nothing is stored");

  const reached = await reachModalAndPickCity(page, isDesktop);
  await shoot(page, vp.tag, "5-denied-no-origin");

  if (reached) {
    const rec = await stored(page);
    check(rec?.source === "city", "the picked city is stored as a CITY origin", JSON.stringify(rec));
    check(rec?.city === CITY, "the stored origin names the city", JSON.stringify(rec?.city));
    check(
      Math.abs((rec?.lat ?? 0) - HAIFA.lat) < 0.01 && Math.abs((rec?.lng ?? 0) - HAIFA.lng) < 0.01,
      "the origin carries the geocoded coordinates", JSON.stringify(rec),
    );

    await checkExactlyOneVisible(page, ORIGIN_LABEL, "exactly one origin label is visible");
    const labelText = await page.locator(vis(ORIGIN_LABEL)).innerText();
    check(labelText.includes(CITY), "the label NAMES the active origin", labelText);
    check(labelText.includes("מרחק"), "the label says what the number measures", labelText);

    await shoot(page, vp.tag, "6-city-origin-active");
    await checkNoHorizontalScroll(page, "city origin active");

    if (isDesktop) {
      check((await page.locator(SORT).inputValue()) === "nearest",
        "the sort switched to מרחק once an origin existed",
        await page.locator(SORT).inputValue());
    }

    // ---- 4: clear -------------------------------------------------------
    await page.locator(vis(CLEAR)).click();
    await page.waitForTimeout(600);
    await shoot(page, vp.tag, "8-after-clear");
    check((await stored(page)) === null, "clear empties the stored origin");
    check((await page.locator(vis(ORIGIN_LABEL)).count()) === 0,
      "the label disappears with the origin it named");
  }

  check(pageErrors.length === 0, "0 page errors (denied context)", JSON.stringify(pageErrors));
  await denied.close();

  // ---- 3: GPS first, then a city REPLACES it -----------------------------
  // Desktop only: it needs the sort select to establish the GPS origin, and
  // the mobile shell has none. Named as a skip rather than silently dropped.
  if (!isDesktop) {
    console.log("    SKIP  gps→city switch: no sort control on the mobile shell");
    return;
  }
  const granted = await newContext(browser, vp, { grant: true });
  const g = await openMap(granted);
  await g.page.selectOption(SORT, "nearest");
  await g.page.waitForTimeout(1200);
  const gpsRec = await stored(g.page);
  check(gpsRec !== null && gpsRec.source === undefined,
    "a real GPS grant stores a fix with no city source", JSON.stringify(gpsRec));
  const gpsLabel = await g.page.locator(vis(ORIGIN_LABEL)).innerText();
  check(gpsLabel.includes("המיקום שלכם"), "the GPS origin is named as such", gpsLabel);
  check(g.pageErrors.length === 0, "0 page errors (granted context)", JSON.stringify(g.pageErrors));
  await granted.close();

  // Now the replacement, in a context where the permission is genuinely
  // WITHHELD. `clearPermissions()` was tried first and is wrong: it returns
  // Chromium to *prompt*, so getCurrentPosition hangs to its 8s timeout and
  // reports code 3 (a toast), never code 1 (the modal) — the harness read that
  // as a broken feature for one run.
  //
  // The GPS record is seeded as a PRECONDITION rather than earned, because the
  // earning path is already proven two lines above in this same run. What is
  // under test here is only what happens to an EXISTING fix when a city is
  // picked afterwards. The seed is byte-identical to what setUserLocation
  // writes for a GPS fix ({lat, lng}, no source) — a richer seed would be
  // testing a record the product cannot produce.
  const denied2 = await newContext(browser, vp, { grant: false });
  const page2 = await denied2.newPage();
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(String(e)));
  await page2.addInitScript(() => {
    localStorage.setItem("cookieConsent", "all");
    localStorage.setItem("user_location", JSON.stringify({ lat: 32.0853, lng: 34.7818 }));
  });
  await page2.goto(`${BASE}/he/map`, { waitUntil: "networkidle" });
  await page2.waitForTimeout(900);

  const seeded = await page2.locator(vis(ORIGIN_LABEL)).innerText();
  check(seeded.includes("המיקום שלכם"), "precondition: a GPS origin is active", seeded);

  // With a fix already stored the sort select is a no-op by PR 1's design (it
  // does not re-prompt), so the map's own crosshair is the only in-product door
  // to the modal from here — which is exactly the path where a city REPLACES a
  // GPS fix with no clear in between.
  await page2.locator('button[aria-label="מרכזו את המפה על המיקום שלי"]').first().click();
  await page2.waitForTimeout(1500);
  const modal = page2.locator('[role="dialog"]');
  const opened = (await modal.count()) > 0;
  check(opened, "the crosshair's denial opens the city fallback with a fix already stored");

  if (opened) {
    await modal.locator(`button:has-text("${CITY}")`).first().click();
    await page2.waitForTimeout(1600);
    const after = await stored(page2);
    check(after?.source === "city", "the city origin REPLACED the GPS fix", JSON.stringify(after));
    check(after?.city === CITY, "…and the surviving record names the city", JSON.stringify(after?.city));
    const switched = await page2.locator(vis(ORIGIN_LABEL)).innerText();
    check(switched.includes(CITY), "the label now names the city, not the device", switched);
    await shoot(page2, vp.tag, "7-origin-switch-gps-to-city");
    await checkNoHorizontalScroll(page2, "after origin switch");
  }

  check(errors2.length === 0, "0 page errors (switch context)", JSON.stringify(errors2));
  await denied2.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) await run(browser, vp);
  await browser.close();
  console.log(`\nScreenshots in ${OUT}`);
  console.log(`${ran.length} checks ran, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
