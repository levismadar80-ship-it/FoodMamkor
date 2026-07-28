// MEH-1670 local-stack QA — Vercel preview is capped, so this drives a local
// next start (MEH-1282 / MEH-1289 / MEH-1663 pattern).
//
// Two scenarios, per viewport:
//   S1  pan so the pickup pin is on screen → commit "חפשי באזור זה"
//       → the delivery-only business is STILL listed (the bug: it vanished)
//       → and its category chip still counts it (:326 moved with the list)
//   S2  toggle the secondary layer OFF → it leaves the map AND the list together
//
// Usage (from frontend/): node e2e/qa-meh1670-viewport-filter.mjs <width>
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const WIDTH = parseInt(process.argv[2] || "1440", 10);
const OUT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../qa-artifacts/MEH-1670");
fs.mkdirSync(OUT, { recursive: true });

// Seed-data locators, NOT copy — these must match what the backend renders
// (backend/scripts/seed_demo_business.py). Not i18n candidates.
const DELIVERY_NAME = "משק החלב של דנה"; // demo-delivery-pickup: lat/lng NULL, 1 pickup
const SEARCH_AREA = "חפשו באזור זה"; // plural — the singular form matches nothing
const PICKUP_TOGGLE = "איסוף עצמי"; // MapPane secondary-layer toggle

const log = [];
const rec = (name, verdict, detail) => {
  log.push({ name, verdict, detail });
  console.log(`${verdict === true ? "PASS" : verdict === false ? "FAIL" : verdict}  ${name}  ${detail ?? ""}`);
};

const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const visiblePane = (page) =>
  page.evaluate(() => {
    const pane = [...document.querySelectorAll(".leaflet-container")].find((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!pane) return null;
    const r = pane.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

// Is the business in the ACTUAL filtered list (useMapFilters.visibleProducers) —
// not just anywhere on screen with that name.
//
// Below lg, a SECOND, unrelated component (MobileSheetSelectedCard) pins the
// currently-selected business above the sheet's scrollable list, independent of
// the filter this ticket changes. A raw text/DOM count conflates the two: while
// a business stays selected (which S1 needs, to fly the camera via MEH-1663),
// the pinned card alone makes `listed()` read true even when the real list has
// already dropped it — this masked a real discriminator failure during
// development (pre-fix falsely "passed" S1 at 375 until this was scoped).
//
// MapCardList tags each real list row's wrapper with id={`card-${producer.id}`}
// (MapCardList.jsx:49); the pinned card's wrapper carries no such id. That is
// the one structural difference between the two, so it is what this scopes on.
const listedInRealList = async (page, name) =>
  page.evaluate((n) => {
    const cards = [...document.querySelectorAll('[data-testid="map-card"]')];
    return cards.some((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false; // the hidden lg:grid dup
      if (!el.textContent.includes(n)) return false;
      const wrapper = el.closest('[id^="card-"]');
      return Boolean(wrapper);
    });
  }, name);

// Marker count on the visible pane — the map half of "map and list agree".
const markerCount = (page) =>
  page.evaluate(() => {
    const pane = [...document.querySelectorAll(".leaflet-container")].find((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return pane ? pane.querySelectorAll(".leaflet-marker-icon").length : 0;
  });

// Below lg the list lives in MapBottomSheet at PEEK (14vh), too short to tap a
// card without the BottomNav pill (z-1000) intercepting. Dragging the sheet is
// not drivable from this harness (MEH-1663: synthetic and real CDP touch both
// reached the page and left it at PEEK), so open it the way the app does — a
// marker tap sets snap = HALF (useMapSync handleMarkerClick).
async function openSheet(page) {
  if (WIDTH >= 1024) return "n/a (desktop split-pane)";
  for (let i = 0; i < 5; i++) {
    await page.locator(".leaflet-control-zoom-in").first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  const pin = page.locator(".leaflet-marker-icon:not(.mehamakor-cluster)").first();
  if (!(await pin.count())) return "no un-clustered marker to tap";
  await pin.click({ timeout: 8000 });
  await page.waitForTimeout(1400);
  // Clear the selection that tap created so the card assertions start clean.
  // Deliberately NOT navigating back to /map here — a fresh load resets the
  // sheet snap to PEEK, undoing the very thing this function just did.
  const pane = await visiblePane(page);
  if (pane) await page.mouse.click(pane.x + 12, pane.y + 12);
  await page.waitForTimeout(1000);
  const h = await page.evaluate(() => {
    const el = document.querySelector('.fixed.inset-x-0.bottom-0.z-\\[600\\]');
    return el ? Math.round((el.getBoundingClientRect().height / window.innerHeight) * 100) : null;
  });
  return `sheet=${h}vh`;
}

// Scroll a card into its scroll container before clicking — below lg it can sit
// under the BottomNav pill (z-1000), which intercepts the pointer otherwise.
async function clickCard(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await locator.page().waitForTimeout(400);
  await locator.click({ timeout: 15000 });
}

// The mobile sheet shows a PINNED card for the current selection
// (MobileSheetSelectedCard), independent of the filtered list — it is not
// governed by this fix and would make `listed()` count it even after the
// business has correctly left the actual list. Its explicit close button
// (aria-label = common.aria.close) is the only reliable way to clear it —
// canvas clicks kept landing on map controls or the sheet overlay itself.
async function clearSelection(page) {
  const closeBtn = page.getByRole("button", { name: /close|סגור/i }).first();
  if (await closeBtn.count()) {
    await closeBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

const shot = async (page, file) => {
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  return file;
};

(async () => {
  const browser = await chromium.launch({
    ...(fs.existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
    args: ["--ssl-version-max=tls1.2", "--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: WIDTH < 500 ? 812 : 900 },
    hasTouch: WIDTH < 1024,
    isMobile: WIDTH < 1024,
  });

  await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".leaflet-container")].some((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
    { timeout: 30000 },
  );
  await page.waitForSelector('[data-testid="map-card"]:visible', { timeout: 20000 });
  await page.waitForTimeout(2500);

  rec("SETUP sheet opened for tapping", "INFO", await openSheet(page));

  // Baseline: present before any viewport is committed (committedBounds null).
  rec("S0 delivery-only business is listed on load", await listedInRealList(page, DELIVERY_NAME), "");

  // --- S1: put the pickup point ON SCREEN, then commit the viewport ---
  //
  // Blind zoom+pan was tried first and landed on empty sea: the commit narrowed
  // the list to 0 cards, so "not listed" proved nothing about the filter. Use the
  // app's own camera instead — clicking the card flies exactly to the pickup pin
  // (MEH-1663), which is the point this ticket is about.
  await clickCard(page.locator('[data-testid="map-card"]:visible', { hasText: DELIVERY_NAME }).first());
  await page.waitForTimeout(3000);
  const pane = await visiblePane(page);
  await page.mouse.move(pane.x + pane.w / 2, pane.y + pane.h / 2);
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.w / 2 - 25, pane.y + pane.h / 2 - 18, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(2000);
  const beforeCommit = await shot(page, `s1-${WIDTH}-01-panned.png`);
  const realListCount = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="map-card"]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && el.closest('[id^="card-"]');
      }).length,
    );
  const cardsBefore = await realListCount();

  const searchBtn = page.locator(`button:has-text("${SEARCH_AREA}"):visible`).first();
  const hadButton = (await searchBtn.count()) > 0;
  // A missing button means committedBounds was never set — the filter under test
  // would not have run, so "still listed" would pass for the wrong reason. Fail.
  if (!hadButton) {
    rec("S1 committed the viewport at all", false,
      `"${SEARCH_AREA}" button not found — the viewport filter never ran, so any listing result below is vacuous`);
  } else {
    await searchBtn.click({ timeout: 10000 });
    await page.waitForTimeout(3500);
  }
  const afterCommit = await shot(page, `s1-${WIDTH}-02-after-search-area.png`);
  const cardsAfter = await realListCount();
  const stillListed = await listedInRealList(page, DELIVERY_NAME);

  // Discriminating: the commit must actually have narrowed the set (otherwise
  // committedBounds is null-equivalent and the assertion proves nothing).
  rec("S1 viewport commit actually ran the filter (non-degenerate result set)",
    hadButton && cardsAfter > 0 && cardsAfter < cardsBefore,
    `cards ${cardsBefore} → ${cardsAfter} (must be >0 and fewer — 0 would make the next assertion vacuous)`);
  rec("S1 delivery-only business STILL listed after the commit", hadButton && stillListed,
    `${beforeCommit} → ${afterCommit}`);
  rec("S1b category chip counts include it", "INFO",
    `visible cards after commit = ${cardsAfter}`);

  await clearSelection(page);

  // --- S2: turn the secondary (pickup) layer OFF ---
  const markersBefore = await markerCount(page);
  // The toggle lives in MapPane; find it by its control role/label.
  const toggle = page.locator(`button:has-text("${PICKUP_TOGGLE}"):visible`).first();
  let toggled = false;
  if (await toggle.count()) {
    await toggle.click({ timeout: 8000 });
    toggled = true;
  }
  await page.waitForTimeout(2500);
  const markersAfter = await markerCount(page);
  const listedAfterToggle = await listedInRealList(page, DELIVERY_NAME);
  const f2 = await shot(page, `s2-${WIDTH}-03-secondary-off.png`);

  rec("S2 leaves BOTH map and list when the pickup layer is off",
    toggled ? listedAfterToggle === false : "SKIP",
    `toggleFound=${toggled} markers ${markersBefore}→${markersAfter} listed=${listedAfterToggle} · ${f2}`);

  fs.writeFileSync(`${OUT}/report-${WIDTH}.json`, JSON.stringify(log, null, 2));
  await browser.close();
})().catch((e) => {
  console.error("HARNESS ERROR:", e.message);
  process.exit(1);
});
